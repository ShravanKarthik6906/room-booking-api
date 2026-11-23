// A tiny fake of the Supabase client so tests run without a real database.
//
// Each test "queues" what the database should return for a table, e.g.
//   mock.queue('rooms', { data: [...], error: null })
// The next query on that table gets that result. Every query is recorded in
// mock.calls so tests can check which filters were used.

const state = { users: {}, responses: {}, calls: [], tokens: [] };

function reset() {
  state.users = {};
  state.responses = {};
  state.calls = [];
  state.tokens = [];
}

// Make a token valid: requests with "Bearer <token>" become this user
function setUser(token, user) {
  state.users[token] = user;
}

function queue(table, result) {
  if (!state.responses[table]) state.responses[table] = [];
  state.responses[table].push({ data: null, error: null, ...result });
}

function nextResult(table) {
  const list = state.responses[table] || [];
  if (list.length === 0) throw new Error(`Test forgot to queue a response for table "${table}"`);
  return Promise.resolve(list.shift());
}

// Builds a chainable query like supabase.from('rooms').select().eq(...)
function queryBuilder(table) {
  const call = { table, ops: [] };
  state.calls.push(call);

  const builder = {};
  const chainable = ['select', 'insert', 'update', 'eq', 'lt', 'gt', 'gte', 'or', 'order', 'limit'];
  for (const method of chainable) {
    builder[method] = (...args) => {
      call.ops.push([method, ...args]);
      return builder;
    };
  }
  builder.single = () => nextResult(table);
  builder.maybeSingle = () => nextResult(table);
  // Lets "await query" work without .single()
  builder.then = (resolve, reject) => nextResult(table).then(resolve, reject);
  return builder;
}

function getSupabase(token) {
  state.tokens.push(token);
  return {
    from: queryBuilder,
    auth: {
      getUser: async (jwt) => {
        const user = state.users[jwt];
        if (user) return { data: { user }, error: null };
        return { data: { user: null }, error: { name: 'AuthApiError', message: 'invalid JWT' } };
      },
    },
  };
}

module.exports = { getSupabase, reset, setUser, queue, state };
