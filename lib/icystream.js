var request = require('request');
var utils = require("./utils.js");
var preprocessor = require("./preprocessor.js");

var packageJson = require('../package.json');
var versionNumber = packageJson.version;
var clientName = "node-internet-radio v" + versionNumber;

function getStreamStation2(url, callback) {
  var completed = false;
  var buffer = "";
  var maxBufferSize = 100000;

  // Failure timer
  var timeout = setTimeout(function() {
    tearDown();
    return callback(new Error("Attempting to fetch station data via stream timed out."));
  }, 5000);

  var r = request({
    url: url,
    encoding: null,
    timeout: 3000,
    maxRedirects: 3,
    headers: {
      'user-agent': clientName,
      'Icy-Metadata': '1',
    },
  });

  r.once('socket', function(socket) {
    preprocessor(socket);
  });

  var dataCallback = function(response) {
    // Append to the buffer and check if our title is fully included yet
    // We're looking for a string with the format of
    // StreamTitle=Artist Name - Song Name;
    buffer += response;

    var titlecheck = getDetailsFromBuffer(buffer);
    if (titlecheck != null) {
      handleBuffer(buffer, callback);
      tearDown();
      return;
    }

    if (buffer.length > maxBufferSize) {
      return returnError();
    }
  };

  var errorCallback = function(error) {
    if (completed) {
      return;
    }
    tearDown();
    console.log(error);
    return callback(error)
  };

  var closeCallback = function() {
    if (areThereErrors(buffer)) {
      return returnError();
    }

    if (completed) {
      return;
    }
  }

  function tearDown() {
    clearTimeout(timeout);

    completed = true;
    buffer = null;

    if (r != null) {
      r.abort()
      r = null;
    }
  }

  function getDetailsFromBuffer(buffer) {
    var startSubstring = "StreamTitle=";
    var startPosition = buffer.indexOf(startSubstring);
    var endSubstring = ";";
    var endPosition = buffer.toString().indexOf(";", startPosition);

    if (startPosition > -1 && endPosition > startPosition) {
      var titleString = buffer.substring(startPosition, endPosition);
      var title = titleString.substring(13, titleString.length - 1);
      return title;
    }

    return null;
  }

  function getHeadersFromBuffer(buffer) {
    var headersArray = buffer.split("\n");
    var headersObject = {};

    headersArray.filter(function(line) {
      return ((line.indexOf("icy") !== -1 && line.indexOf(":") !== -1) || line.toLowerCase().indexOf("content-type") !== -1)
    }).forEach(function(line) {
      var keyValueArray = line.trim().split(":");
      headersObject[keyValueArray[0].toLowerCase()] = keyValueArray[1].trim();
    });

    return headersObject;
  }

  function handleBuffer(buffer, callback) {
    var title = getDetailsFromBuffer(buffer);
    title = utils.fixTrackTitle(title)

    var headers = getHeadersFromBuffer(buffer);

    var station = {};
    station.title = title;
    station.fetchsource = "STREAM";
    station.headers = headers

    return callback(null, station);
  }

  function areThereErrors(buffer) {
    // If we get back HTML there's a problem
    var contentTypeTest = /Content-Type: text\/html(.*)/m.exec(buffer);
    if (contentTypeTest) {
      return true;
    }

    return false
  }

  function returnError() {
    tearDown();
    return callback(new Error("Error fetching stream"));
  }

  r.on('data', dataCallback);
  r.on('close', closeCallback);
  r.on('error', errorCallback);
}


module.exports.getStreamStation = getStreamStation2;
