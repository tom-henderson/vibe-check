// Local test of the Lambda handler against a mocked DynamoDB. Not shipped to
// Lambda (only app.mjs is). Run: node handler.test.mjs
import assert from "node:assert";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

process.env.TABLE_NAME = "current-mood-test";
const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import("../src/app.mjs");

const evt = (method, body) => ({
  requestContext: { http: { method } },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body) });

let passed = 0;
const check = (name, cond) => {
  assert.ok(cond, "FAILED: " + name);
  passed++;
};

// 1) GET on an empty day → all zeros, no winners.
ddbMock.reset();
ddbMock.on(GetCommand).resolves({}); // no Item
{
  const { status, body } = parse(await handler(evt("GET")));
  check("GET empty status 200", status === 200);
  check("GET empty total 0", body.total === 0);
  check("GET empty winners []", Array.isArray(body.winners) && body.winners.length === 0);
  check("GET counts all zero", Object.values(body.counts).every((n) => n === 0));
  check("GET dayKey format", /^\d{4}-\d{2}-\d{2}$/.test(body.dayKey));
}

// 2) GET with data → correct total + single winner.
ddbMock.reset();
ddbMock.on(GetCommand).resolves({ Item: { dayKey: "x", m1: 10, m2: 15, m3: 41, m4: 30, m5: 22 } });
{
  const { body } = parse(await handler(evt("GET")));
  check("GET total 118", body.total === 118);
  check("GET winner m3", body.winners.length === 1 && body.winners[0] === "m3");
}

// 3) GET tie → multiple winners.
ddbMock.reset();
ddbMock.on(GetCommand).resolves({ Item: { m3: 34, m4: 34, m5: 18 } });
{
  const { body } = parse(await handler(evt("GET")));
  check("GET tie two winners", body.winners.length === 2 && body.winners.includes("m3") && body.winners.includes("m4"));
}

// 4) POST valid vote → ADD command with correct shape, returns fresh counts.
ddbMock.reset();
ddbMock.on(UpdateCommand).resolves({ Attributes: { m3: 42, m4: 30 } });
{
  const { status, body } = parse(await handler(evt("POST", { mood: "m3" })));
  check("POST status 200", status === 200);
  check("POST returns fresh total", body.total === 72);
  const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
  check("POST uses ADD expr", call.UpdateExpression === "ADD #mood :one");
  check("POST name maps to mood", call.ExpressionAttributeNames["#mood"] === "m3");
  check("POST value is 1", call.ExpressionAttributeValues[":one"] === 1);
  check("POST returns ALL_NEW", call.ReturnValues === "ALL_NEW");
}

// 5) POST invalid mood → 400, no write.
ddbMock.reset();
{
  const { status, body } = parse(await handler(evt("POST", { mood: "m9" })));
  check("POST invalid 400", status === 400);
  check("POST invalid error msg", /m1\.\.m5/.test(body.error));
  check("POST invalid no write", ddbMock.commandCalls(UpdateCommand).length === 0);
}

// 6) POST malformed JSON → 400.
ddbMock.reset();
{
  const r = await handler({ requestContext: { http: { method: "POST" } }, body: "{not json" });
  check("POST bad json 400", r.statusCode === 400);
}

// 7) Unsupported method → 405.
{
  const r = await handler(evt("DELETE"));
  check("DELETE 405", r.statusCode === 405);
}

console.log(`\n✓ all ${passed} checks passed`);
