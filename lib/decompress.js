"use strict";

var PassThrough = require("stream").PassThrough;
var zlib = require("zlib");
var contentTypes = require("./content-types.js");
var debug = require("debug")("unblocker:decompress");

module.exports = function (config) {
  function acceptableCompression(data) {
    // deflate is tricky so we're only going to ask for gzip if the client allows it
    if (
      data.headers["accept-encoding"] &&
      data.headers["accept-encoding"].includes("gzip")
    ) {
      data.headers["accept-encoding"] = "gzip";
    } else {
      delete data.headers["accept-encoding"];
    }
  }

  function shouldProcess(data) {
    if ([204, 304].includes(data.remoteResponse.statusCode)) {
      return false;
    }

    var headers = data.headers;
    if (parseInt(headers["content-length"], 10) === 0) {
      return false;
    }

    // decompress if it's gzipped or deflate'd
    return (
      headers["content-encoding"] == "gzip" ||
      headers["content-encoding"] == "deflate"
    );
  }

  function decompressResponse(data) {
    if (contentTypes.shouldProcess(config, data) && shouldProcess(data)) {
      debug(
        "decompressing %s encoding and deleting content-encoding header",
        data.headers["content-encoding"]
      );
      var sourceStream = data.stream;
      var placeHolder = new PassThrough();
      data.stream = placeHolder;

      var handleData = function handleData() {
        var firstChunk = sourceStream.read();

        if (firstChunk === null) {
          placeHolder.end();
          return;
        }

        var decompressStream;
        if (data.headers["content-encoding"] == "deflate") {
          decompressStream = zlib.createInflateRaw();
        } else {
          decompressStream = zlib.createUnzip();
        }

        decompressStream.write(firstChunk);
        sourceStream.pipe(decompressStream).pipe(placeHolder);
      };
      sourceStream.once("readable", handleData);

      delete data.headers["content-encoding"];
    }
  }

  return {
    handleRequest: acceptableCompression,
    handleResponse: decompressResponse,
  };
};
