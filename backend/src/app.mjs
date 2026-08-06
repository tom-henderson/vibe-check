// Current Mood — Lambda handler behind a Function URL.
// Two operations on a single DynamoDB table (one item per NZ day):
//   GET  -> today's counts / total / winners
//   POST -> record one vote (atomic ADD), returns the fresh counts
//
// The day boundary is Pacific/Auckland, computed server-side on every request
// (never trusted from the client). Reset is implicit: at NZ midnight the dayKey
// rolls to a new, absent item that reads as zero votes.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME;
const MOOD_IDS = ["m1", "m2", "m3", "m4", "m5"];

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Current calendar date in Pacific/Auckland as "YYYY-MM-DD" (DST-correct: relies
// on the runtime's full ICU tz database, not a fixed offset).
function nzDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Build the §6 response shape from a raw item (or none).
function buildState(dayKey, item) {
  const counts = {};
  let total = 0;
  for (const id of MOOD_IDS) {
    const n = Number(item?.[id]) || 0;
    counts[id] = n;
    total += n;
  }
  let winners = [];
  if (total > 0) {
    const max = Math.max(...MOOD_IDS.map((id) => counts[id]));
    winners = MOOD_IDS.filter((id) => counts[id] === max);
  }
  return { dayKey, counts, total, winners };
}

function json(statusCode, body) {
  // CORS response headers are added by the Function URL's own CORS config, so
  // the handler only sets content type here.
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function readState(dayKey) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { dayKey } })
  );
  return buildState(dayKey, res.Item);
}

async function castVote(dayKey, mood) {
  // Atomic increment + upsert: no read-modify-write, so concurrent votes can't
  // be lost. ADD creates the attribute (and the item) if absent.
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { dayKey },
      UpdateExpression: "ADD #mood :one",
      ExpressionAttributeNames: { "#mood": mood },
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "ALL_NEW",
    })
  );
  return buildState(dayKey, res.Attributes);
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  const dayKey = nzDayKey();

  try {
    if (method === "GET") {
      return json(200, await readState(dayKey));
    }

    if (method === "POST") {
      let mood;
      try {
        mood = JSON.parse(event.body || "{}").mood;
      } catch {
        return json(400, { error: "invalid JSON body" });
      }
      if (!MOOD_IDS.includes(mood)) {
        return json(400, { error: "mood must be one of m1..m5" });
      }
      return json(200, await castVote(dayKey, mood));
    }

    return json(405, { error: "method not allowed" });
  } catch (err) {
    console.error("handler error:", err);
    return json(500, { error: "internal error" });
  }
};
