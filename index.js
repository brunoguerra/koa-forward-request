'use strict';

var assert = require('assert');
var fs = require('fs');

var request = require('request');
var merge = require('merge-descriptors');
var isUrl = require('is-url');

module.exports = function forwardRequest(app, defaultOptions) {
  defaultOptions = defaultOptions || {};

  app.context.forward = function (ctx, url, options) {
    assert('string' === typeof url, 'first parameter must be a url string.');

    options = options || {};
    options = merge(options, defaultOptions);

    if (isUrl(url)) {
      options.url = options.url || url;
    } else {
      options.url = options.url || url;
      options.baseUrl = options.baseUrl || ctx.protocol + '://' + ctx.host;
    }
    options.method = options.method || ctx.method;
    delete ctx.header.host;
    options.headers = options.headers || ctx.header;
    options.qs = options.qs || ctx.query;

    switch (ctx.is('json', 'multipart/form-data', 'urlencoded')) {
    case 'json':
      delete options.headers['content-length'];
      options.body = options.body || ctx.request.body;
      options.json = true;
      // options.headers['content-type'] = ctx.headers['content-type'];
      break;
    case 'multipart/form-data':
      var body = ctx.request.body;
      var files = body.files || {};
      var fields = body.fields || {};
      if (!options.formData) {
        delete options.headers['content-length'];
        options.formData = {};

        Object.keys(files).forEach(function (filename) {
          options.formData[filename] = {
            value: fs.createReadStream(files[filename].path),
            options: {
              filename: files[filename].name,
              contentType: files[filename].type
            }
          };
        });
        Object.keys(fields).forEach(function (item) {
          options.formData[item] = fields[item];
        });
      }
      break;
    case 'urlencoded':
      options.form = options.form || ctx.request.body;
      break;
    default:
      if (!~['HEAD', 'GET', 'DELETE'].indexOf(options.method)) {
        options.body = options.body || ctx.request.body;
      }
    }
    
    var self = ctx;
    self.respond = false;

    if (options.debug) {
      console.log('forward options -> %j', options);
    }

    request(options)
    .on('error', function (err) {
      if (err.code === 'ENOTFOUND') {
        self.res.statusCode = 404;
        self.res.end();
      } else {
        console.error(err);
        throw err;
      }
    })
    .pipe(self.res);
  };

  module.exports.all = function all () {
    assert(defaultOptions.baseUrl, 'use `all()` must set `baseUrl` in options');

    return handle; 

    function handle(ctx, next) {
      const r = next();
      if (r) {
        r.then(check).catch((e) => ctx.throw(e));
      } else {
        check();
      }
      function check() {
        if (ctx.status === 404) {
          ctx.status = 200;
          try {
            ctx.forward(ctx, ctx.originalUrl);
          } catch (e) {
            ctx.throw(e);
          }
        }
      }
    };
  };

  return app;
};