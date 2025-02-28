var Promise = require('bluebird');
var Bookshelf = require('../bookshelf');
var chai = require('chai');
global.sinon = require('sinon');
global.expect = chai.expect;
var databaseConnections;

Promise.longStackTraces();
Promise.onPossiblyUnhandledRejection(function(err) {
  throw err;
});

// http://bluebirdjs.com/docs/api/error-management-configuration.html#global-rejection-events
process.on('unhandledRejection', function(reason, promise) {
  console.error(reason);
});

chai.use(require('sinon-chai'));
chai.should();

after(function() {
  return databaseConnections.map((connection) => connection.knex.destroy());
});

describe('Unit Tests', function() {
  var base = require('./base');
  base.Collection();
  base.Events();

  require('./unit/bookshelf')();
  require('./unit/sql/sync')();
  require('./unit/sql/model')();
});

describe('Integration Tests', function() {
  databaseConnections = require('./integration')(Bookshelf);
});
