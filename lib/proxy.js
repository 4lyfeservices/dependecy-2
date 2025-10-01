"use strict";

var URL = require("url"),
  http = require("http"),
  https = require("https"),
  _ = require("lodash"),
  contentTypes = require("./content-types.js"),
  debug = require("debug")("unblocker:proxy");

function proxy(config) {
  function proxyRequest(data, next) {
    debug("proxying %s %s", data.clientRequest.method, data.url);

    var middlewareHandledRequest = _.some(
      config.requestMiddleware,
      function (middleware) {
        middleware(data);
        return data.clientResponse.headersSent;
      }
    );

    if (!middlewareHandledRequest) {
      var uri = URL.parse(data.url);

      var options = {
        host: uri.hostname,
        port: uri.port,
        path: uri.path,
        method: data.clientRequest.method,
        headers: data.headers,
      };

      if (uri.protocol == "http:" && config.httpAgent) {
        options.agent = config.httpAgent;
      }
      if (uri.protocol == "https:" && config.httpsAgent) {
        options.agent = config.httpsAgent;
      }

      var proto = uri.protocol == "https:" ? https : http;

      debug("sending remote request: ", options);

      data.remoteRequest = proto.request(options, function (remoteResponse) {
        data.remoteResponse = remoteResponse;
        data.remoteResponse.on("error", next);
        proxyResponse(data);
      });

      data.remoteRequest.on("error", next);
      data.stream.pipe(data.remoteRequest);
    }
  }

  function proxyResponse(data) {
    debug(
      "proxying %s response for %s",
      data.remoteResponse.statusCode,
      data.url
    );
    data.headers = _.cloneDeep(data.remoteResponse.headers);

    debug("remote response headers", data.headers);
    data.stream = data.remoteResponse;

    data.contentType = contentTypes.getType(data);

    var middlewareHandledResponse = _.some(
      config.responseMiddleware,
      function (middleware) {
        middleware(data);
        return data.clientResponse.headersSent; 
      }
    );

    if (!middlewareHandledResponse) {
      data.clientResponse.writeHead(
        data.remoteResponse.statusCode,
        data.headers
      );
      data.stream.pipe(data.clientResponse);
    }
  }

  return proxyRequest;
}

module.exports = proxy;
