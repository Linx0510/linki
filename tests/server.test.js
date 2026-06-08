const assert = require('node:assert/strict');
const test = require('node:test');

const loadServer = () => {
  delete require.cache[require.resolve('../server')];
  return require('../server');
};

const withEnv = (env, callback) => {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    delete require.cache[require.resolve('../server')];
  }
};

test('production app trusts the first reverse proxy for secure session cookies', () => {
  withEnv({ SESSION_SECRET: 'test-secret', NODE_ENV: 'production' }, () => {
    const { createApp } = loadServer();
    const app = createApp();

    assert.equal(app.get('trust proxy'), 1);
  });
});

test('non-production app keeps Express default proxy trust', () => {
  withEnv({ SESSION_SECRET: 'test-secret', NODE_ENV: 'test' }, () => {
    const { createApp } = loadServer();
    const app = createApp();

    assert.equal(app.get('trust proxy'), false);
  });
});
