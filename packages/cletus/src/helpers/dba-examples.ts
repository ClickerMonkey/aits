/**
 * Example queries for DBA operations.
 * These examples are used in both tool instructions and prompt content.
 */
export const QUERY_EXAMPLES = `Example 1: Simple SELECT with filter
Description: Select the names of active users, limited to 10 results.
{
  "kind": "select",
  "values": [{ "alias": "name", "value": { "source": "users", "column": "name" } }],
  "from": { "kind": "table", "table": "users" },
  "where": [{ "kind": "comparison", "left": { "source": "users", "column": "active" }, "cmp": "=", "right": true }],
  "limit": 10
}

Example 2: JOIN query between two different tables
Description: Select user names and their order totals by joining users and orders tables.
{
  "kind": "select",
  "values": [
    { "alias": "userName", "value": { "source": "users", "column": "name" } },
    { "alias": "orderTotal", "value": { "source": "orders", "column": "total" } }
  ],
  "from": { "kind": "table", "table": "users" },
  "joins": [{
    "source": { "kind": "table", "table": "orders" },
    "type": "inner",
    "on": [{ "kind": "comparison", "left": { "source": "users", "column": "id" }, "cmp": "=", "right": { "source": "orders", "column": "userId" } }]
  }]
}

Example 3: Aggregation with GROUP BY
Description: Calculate the average price of products grouped by category.
{
  "kind": "select",
  "values": [
    { "alias": "category", "value": { "source": "products", "column": "category" } },
    { "alias": "avgPrice", "value": { "kind": "aggregate", "aggregate": "avg", "value": { "source": "products", "column": "price" } } }
  ],
  "from": { "kind": "table", "table": "products" },
  "groupBy": [{ "source": "products", "column": "category" }]
}

Example 4: Simple INSERT with constant values
Description: Insert a new user record with name, email, and age values.
{
  "kind": "insert",
  "table": "users",
  "columns": ["name", "email", "age"],
  "values": ["Alice Smith", "alice@example.com", 30]
}

Example 5: INSERT with ON CONFLICT
Description: Insert a user, but if the email already exists, update the name instead.
{
  "kind": "insert",
  "table": "users",
  "columns": ["email", "name"],
  "values": ["bob@example.com", "Bob Jones"],
  "onConflict": {
    "columns": ["email"],
    "update": [{ "column": "name", "value": "Bob Jones" }]
  }
}

Example 6: INSERT from SELECT
Description: Copy inactive users from the users table into the archive_users table.
{
  "kind": "insert",
  "table": "archive_users",
  "columns": ["name", "email"],
  "select": {
    "kind": "select",
    "values": [
      { "alias": "name", "value": { "source": "users", "column": "name" } },
      { "alias": "email", "value": { "source": "users", "column": "email" } }
    ],
    "from": { "kind": "table", "table": "users" },
    "where": [{ "kind": "comparison", "left": { "source": "users", "column": "active" }, "cmp": "=", "right": false }]
  }
}

Example 7: UPDATE with WHERE
Description: Deactivate users who haven't logged in since 2023-01-01.
{
  "kind": "update",
  "table": "users",
  "set": [
    { "column": "active", "value": false },
    { "column": "deactivatedAt", "value": { "kind": "function", "function": "now", "args": [] } }
  ],
  "where": [{ "kind": "comparison", "left": { "source": "users", "column": "lastLogin" }, "cmp": "<", "right": "2023-01-01" }]
}

Example 8: DELETE with WHERE
Description: Delete temporary data records created before 2024-01-01.
{
  "kind": "delete",
  "table": "temp_data",
  "where": [{ "kind": "comparison", "left": { "source": "temp_data", "column": "created" }, "cmp": "<", "right": "2024-01-01" }]
}

Example 9: SELECT all columns using * wildcard
Description: Select all columns from the users table, limited to 10 results.
{
  "kind": "select",
  "values": [{ "alias": "all", "value": { "source": "users", "column": "*" } }],
  "from": { "kind": "table", "table": "users" },
  "limit": 10
}

Example 10: SELECT with * and additional computed columns
Description: Select all user columns plus a computed fullName column combining firstName and lastName.
{
  "kind": "select",
  "values": [
    { "alias": "all", "value": { "source": "users", "column": "*" } },
    { "alias": "fullName", "value": { "kind": "binary", "left": { "source": "users", "column": "firstName" }, "op": "+", "right": { "source": "users", "column": "lastName" } } }
  ],
  "from": { "kind": "table", "table": "users" }
}

Example 11: Self-join using aliased tables
Description: Find pairs of users who share the same email domain. Use "aliased" kind when the same table appears multiple times.
{
  "kind": "select",
  "values": [
    { "alias": "user1Name", "value": { "source": "u1", "column": "name" } },
    { "alias": "user2Name", "value": { "source": "u2", "column": "name" } },
    { "alias": "sharedDomain", "value": { "source": "u1", "column": "emailDomain" } }
  ],
  "from": { "kind": "aliased", "table": "users", "as": "u1" },
  "joins": [{
    "source": { "kind": "aliased", "table": "users", "as": "u2" },
    "type": "inner",
    "on": [
      { "kind": "comparison", "left": { "source": "u1", "column": "emailDomain" }, "cmp": "=", "right": { "source": "u2", "column": "emailDomain" } },
      { "kind": "comparison", "left": { "source": "u1", "column": "id" }, "cmp": "<", "right": { "source": "u2", "column": "id" } }
    ]
  }]
}

Example 12: Semantic similarity search with conditions
Description: Find the top 10 bank transactions over $1000 that are semantically similar to vehicle-related purchases.
{
  "kind": "select",
  "values": [
    { "alias": "transaction", "value": { "source": "transactions", "column": "*" } },
    { "alias": "similarity", "value": { "kind": "semanticSimilarity", "table": "transactions", "query": "vehicle purchase car automotive" } }
  ],
  "from": { "kind": "table", "table": "transactions" },
  "where": [
    { "kind": "comparison", "left": { "source": "transactions", "column": "amount" }, "cmp": ">", "right": 1000 }
  ],
  "orderBy": [
    { "value": { "kind": "semanticSimilarity", "table": "transactions", "query": "vehicle purchase car automotive" }, "dir": "desc" }
  ],
  "limit": 10
}

Example 13: Recursive CTE with multiple operations
Description: Find a project and all its ancestors using recursion, update all active projects to assign them to a user, then return the count of updated projects.
{
  "kind": "withs",
  "withs": [
    {
      "kind": "cte-recursive",
      "name": "project_hierarchy",
      "statement": {
        "kind": "select",
        "values": [
          { "alias": "id", "value": { "source": "projects", "column": "id" } },
          { "alias": "name", "value": { "source": "projects", "column": "name" } },
          { "alias": "parentId", "value": { "source": "projects", "column": "parentId" } },
          { "alias": "status", "value": { "source": "projects", "column": "status" } },
          { "alias": "level", "value": 0 }
        ],
        "from": { "kind": "table", "table": "projects" },
        "where": [
          { "kind": "comparison", "left": { "source": "projects", "column": "id" }, "cmp": "=", "right": "target-project-id" }
        ]
      },
      "recursiveStatement": {
        "kind": "select",
        "values": [
          { "alias": "id", "value": { "source": "p", "column": "id" } },
          { "alias": "name", "value": { "source": "p", "column": "name" } },
          { "alias": "parentId", "value": { "source": "p", "column": "parentId" } },
          { "alias": "status", "value": { "source": "p", "column": "status" } },
          { "alias": "level", "value": { "kind": "binary", "left": { "source": "ph", "column": "level" }, "op": "+", "right": 1 } }
        ],
        "from": { "kind": "aliased", "table": "projects", "as": "p" },
        "joins": [{
          "source": { "kind": "aliased", "table": "project_hierarchy", "as": "ph" },
          "type": "inner",
          "on": [
            { "kind": "comparison", "left": { "source": "p", "column": "id" }, "cmp": "=", "right": { "source": "ph", "column": "parentId" } }
          ]
        }]
      }
    },
    {
      "kind": "cte",
      "name": "updated_projects",
      "statement": {
        "kind": "update",
        "table": "projects",
        "set": [
          { "column": "assignedTo", "value": "user-123" }
        ],
        "from": { "kind": "table", "table": "project_hierarchy" },
        "where": [
          { "kind": "comparison", "left": { "source": "projects", "column": "id" }, "cmp": "=", "right": { "source": "project_hierarchy", "column": "id" } },
          { "kind": "comparison", "left": { "source": "project_hierarchy", "column": "status" }, "cmp": "=", "right": "active" }
        ],
        "returning": [
          { "alias": "id", "value": { "source": "projects", "column": "id" } }
        ]
      }
    }
  ],
  "final": {
    "kind": "select",
    "values": [
      { "alias": "updatedCount", "value": { "kind": "aggregate", "aggregate": "count", "value": "*" } }
    ],
    "from": { "kind": "table", "table": "updated_projects" }
  }
}`;
