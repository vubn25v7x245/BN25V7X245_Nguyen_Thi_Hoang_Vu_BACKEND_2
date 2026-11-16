const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const app = require("../app");
const MongoDB = require("../app/utils/mongodb.util");
const request = require("./helpers");

// In-memory collection: these tests verify API behavior, not MongoDB itself.
let documents;
function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && Object.hasOwn(value, "$regex")) {
      return new RegExp(value.$regex, value.$options).test(document[key]);
    }
    if (value instanceof ObjectId)
      return String(document[key]) === String(value);
    return document[key] === value;
  });
}

beforeEach(() => {
  documents = [];
  const collection = {
    async findOneAndUpdate(filter, update, options) {
      let document = documents.find((item) => matches(item, filter));
      if (!document && options.upsert) {
        document = { ...filter, _id: new ObjectId() };
        documents.push(document);
      }
      if (!document) return null;
      Object.assign(document, update.$set);
      return { ...document };
    },
    find(filter) {
      return {
        toArray: async () => documents.filter((item) => matches(item, filter)),
      };
    },
    async findOne(filter) {
      return documents.find((item) => matches(item, filter)) || null;
    },
    async findOneAndDelete(filter) {
      const index = documents.findIndex((item) => matches(item, filter));
      return index < 0 ? null : documents.splice(index, 1)[0];
    },
    async deleteMany(filter) {
      const previousCount = documents.length;
      documents = documents.filter((item) => !matches(item, filter));
      return { deletedCount: previousCount - documents.length };
    },
  };
  MongoDB.client = { db: () => ({ collection: () => collection }) };
});

test("CRUD, name search, favorites and missing contacts", async () => {
  const created = await request(app, "POST", "/api/contacts", {
    name: "Long Tran",
    email: "long@example.com",
    phone: "0901234567",
    favorite: true,
  });
  assert.equal(created.status, 200);
  const url = `/api/contacts/${created.body._id}`;
  const other = await request(app, "POST", "/api/contacts", {
    name: "Mai Anh",
  });
  assert.equal(other.status, 200);
  assert.equal(other.body.favorite, false);
  assert.equal((await request(app, "GET", "/api/contacts")).body.length, 2);
  const search = await request(app, "GET", "/api/contacts?name=LONG");
  assert.deepEqual(
    search.body.map((item) => item.name),
    ["Long Tran"],
  );
  const favorites = await request(app, "GET", "/api/contacts/favorite");
  assert.deepEqual(
    favorites.body.map((item) => item.name),
    ["Long Tran"],
  );
  assert.deepEqual((await request(app, "GET", url)).body, created.body);
  assert.equal(
    (await request(app, "PUT", url, { phone: "0912345678" })).status,
    200,
  );
  assert.equal((await request(app, "GET", url)).body.phone, "0912345678");
  assert.equal(
    (await request(app, "PUT", url, { favorite: false })).status,
    200,
  );
  assert.deepEqual(
    (await request(app, "GET", "/api/contacts/favorite")).body,
    [],
  );
  assert.equal(
    (await request(app, "PUT", url, { favorite: true })).status,
    200,
  );
  assert.equal(
    (await request(app, "GET", "/api/contacts/favorite")).body.length,
    1,
  );
  assert.equal((await request(app, "DELETE", url)).status, 200);
  for (const method of ["GET", "DELETE", "PUT"]) {
    assert.equal(
      (await request(app, method, url, { phone: "0900000000" })).status,
      404,
    );
  }
  assert.deepEqual(await request(app, "DELETE", "/api/contacts"), {
    status: 200,
    body: { message: "1 contacts were deleted successfully" },
  });
  assert.deepEqual((await request(app, "GET", "/api/contacts")).body, []);
});

for (const [field, invalidValues] of Object.entries({
  name: [123, [], {}, null, "", "   "],
  email: [123, [], {}, null],
  address: [123, [], {}, null],
  phone: [123, [], {}, null],
  favorite: ["true", "false", 0, 1, [], {}, null],
})) {
  for (const value of invalidValues) {
    test(`POST and PUT reject ${field}=${JSON.stringify(value)} without changing data`, async () => {
      const created = await request(app, "POST", "/api/contacts", {
        name: "Valid",
      });
      for (const method of ["POST", "PUT"]) {
        const url =
          method === "POST"
            ? "/api/contacts"
            : `/api/contacts/${created.body._id}`;
        const response = await request(app, method, url, {
          name: "Valid",
          [field]: value,
        });
        assert.equal(response.status, 400);
      }
      assert.deepEqual((await request(app, "GET", "/api/contacts")).body, [
        created.body,
      ]);
    });
  }
}

test("Missing, array and empty contact bodies return 400", async () => {
  for (const method of ["POST", "PUT"]) {
    for (const body of [undefined, [], {}, { name: "" }]) {
      const url = method === "POST" ? "/api/contacts" : "/api/contacts/123";
      assert.equal((await request(app, method, url, body)).status, 400);
    }
  }
});

test("Search treats regex characters as literal text", async () => {
  const name = "Vu [a].*+?^${}()|\\";
  await request(app, "POST", "/api/contacts", { name });
  await request(app, "POST", "/api/contacts", { name: "Another contact" });
  for (const term of ["[", ".*", "\\", name]) {
    const response = await request(
      app,
      "GET",
      `/api/contacts?name=${encodeURIComponent(term)}`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.map((item) => item.name),
      [name],
    );
  }
});

test("Search rejects array and object query values", async () => {
  for (const query of ["name[]=Vu", "name[$ne]=Vu", "name=Vu&name=Mai"]) {
    assert.equal(
      (await request(app, "GET", `/api/contacts?${query}`)).status,
      400,
    );
  }
});

test("Welcome and JSON 404 responses are preserved", async () => {
  assert.equal((await request(app, "GET", "/")).status, 200);
  assert.deepEqual(await request(app, "GET", "/unknown"), {
    status: 404,
    body: { message: "Resource not found" },
  });
});
