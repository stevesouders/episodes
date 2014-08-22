/*
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the source code here:
    https://github.com/stevesouders/episodes.git
*/


// Don't overwrite pre-existing instances of the object (esp. for older browsers).
var EPISODES = EPISODES || {};
EPISODES.q = EPISODES.q || [];
EPISODES.version = "0.2";
EPISODES.targetOrigin = document.location.protocol + "//" + document.location.hostname;
EPISODES.bPostMessage = ("undefined" != typeof(window.postMessage));

// CUSTOMIZE THESE VARIABLES!!
EPISODES.beaconUrl = EPISODES.beaconUrl || '/images/beacon.gif';
EPISODES.autorun = ( "undefined" != typeof(EPISODES.autorun) ? EPISODES.autorun : true );


EPISODES.init = function() {
	EPISODES.bDone = false;
    EPISODES.marks = {};
    EPISODES.measures = {};
    EPISODES.starts = {};  // We need to save the starts so that given a measure we can say the epoch times that it began and ended.
	EPISODES.findStartTime();
	EPISODES.addEventListener("beforeunload", EPISODES.beforeUnload, false);
	EPISODES.addEventListener("load", EPISODES.onload, false); // TODO - this could happen AFTER the load event has already fired!!

	// Process any commands that have been queued up while episodes.js loaded asynchronously.
	EPISODES.processQ();
};


// Process any commands in the queue.
// The command queue is used to store calls to the API before the full script has been loaded.
EPISODES.processQ = function() {
	var len = EPISODES.q.length;
	for ( var i = 0; i < len; i++ ) {
		var aParams = EPISODES.q[i];
		var cmd = aParams[0];
		if ( "mark" === cmd ) {
			EPISODES.mark(aParams[1], aParams[2]);
		}
		else if ( "measure" === cmd ) {
			EPISODES.measure(aParams[1], aParams[2], aParams[3]);
		}
		else if ( "done" === cmd ) {
			EPISODES.done(aParams[1]);
		}
	}
};


// Set a time marker (typically the beginning of an episode).
EPISODES.mark = function(markName, markTime) {
	EPISODES.dprint("EPISODES.mark: " + markName + ", " + markTime);

	if ( ! markName) {
		EPISODES.dprint("Error: markName is undefined in EPISODES.mark.");
		return;
	}

	EPISODES.marks[markName] = parseInt(markTime || new Date().getTime());

	if ( EPISODES.bPostMessage ) {
		window.postMessage("EPISODES:mark:" + markName + ":" + markTime, EPISODES.targetOrigin);
	}

	// Special marks that we look for:
	if ( "firstbyte" === markName ) {
		EPISODES.measure("backend", "starttime", "firstbyte");
	}
	else if ( "onload" === markName ) {
		EPISODES.measure("frontend", "firstbyte", "onload");
		EPISODES.measure("page load time", "starttime", "onload");
	}
	else if ( "done" === markName ) {
		EPISODES.measure("total load time", "starttime", "done");
	}
};


// Measure an episode.
EPISODES.measure = function(episodeName, startNameOrTime, endNameOrTime) {
	EPISODES.dprint("EPISODES.measure: " + episodeName + ", " + startNameOrTime + ", " + endNameOrTime);

	if ( ! episodeName) {
		EPISODES.dprint("Error: episodeName is undefined in EPISODES.measure.");
		return;
	}

	var startEpochTime;
	if ( "undefined" === typeof(startNameOrTime) ) {
		if ( "number" === typeof(EPISODES.marks[episodeName]) ) {
			// If no startName is specified, then use the episodeName as the start mark.
			startEpochTime = EPISODES.marks[episodeName];
		}
		else {
			// Create a "measure" that is this exact point in time?
			startEpochTime = new Date().getTime();
		}
	}
	else if ( "number" === typeof(EPISODES.marks[startNameOrTime]) ) {
		// If a mark with this name exists, use that.
		startEpochTime = EPISODES.marks[startNameOrTime];
	}
	else if ( "number" === typeof(startNameOrTime) ) {
		// Assume a specific epoch time is provided.
		startEpochTime = startNameOrTime;
	}
	else {
		EPISODES.dprint("Error: unexpected startNameOrTime in EPISODES.measure: " + startNameOrTime);
		return;
	}

	var endEpochTime;
	if ( "undefined" === typeof(endNameOrTime) ) {
		endEpochTime = new Date().getTime();
	}
	else if ( "number" === typeof(EPISODES.marks[endNameOrTime]) ) {
		// If a mark with this name exists, use that.
		endEpochTime = EPISODES.marks[endNameOrTime];
	}
	else if ( "number" === typeof(endNameOrTime) ) {
		endEpochTime = endNameOrTime;
	}
	else {
		EPISODES.dprint("Error: unexpected endNameOrTime in EPISODES.measure: " + endNameOrTime);
		return;
	}

	EPISODES.starts[episodeName] = parseInt(startEpochTime);
	EPISODES.measures[episodeName] = parseInt(endEpochTime - startEpochTime);

	if ( EPISODES.bPostMessage ) {
		window.postMessage("EPISODES:measure:" + episodeName + ":" + startEpochTime + ":" + endEpochTime, EPISODES.targetOrigin);
	}
};


// In the case of Ajax or post-onload episodes, call done to signal the end of episodes.
EPISODES.done = function(callback) {
	EPISODES.bDone = true;

	EPISODES.mark("done");

	if ( EPISODES.autorun ) {
		EPISODES.sendBeacon();
	}

	if ( EPISODES.bPostMessage ) {
		window.postMessage("EPISODES:done", EPISODES.targetOrigin);
	}

	if ( "function" === typeof(callback) ) {
		callback();
	}
};


// Return an object of mark names and their corresponding times.
EPISODES.getMarks = function() {
	return EPISODES.marks;
};


// Return an object of episode names and their corresponding durations.
EPISODES.getMeasures = function() {
	return EPISODES.measures;
};


// Return an object of episode names and their corresponding start times.
// This is needed so that we can determine the start and end time of a duration.
EPISODES.getStarts = function() {
	return EPISODES.starts;
};



// Construct a querystring of episodic time measurements and send it to the specified URL.
//    url      The URL to which to send the beacon request. 
//             This is the full path including filename, but without querystring params.
//             Example: "http://yourdomain.com/gen204"
//             A best practice is to return a 204 "No Content" response.
//             If not specified then EPISODES.beaconUrl is used.
//
//    params - An object of key|value pairs that are added to the URL's querystring.
//             Example: { "pageType": "login", "dataCenter": "Wash DC" }
//             That example would add this to the querystring: &pageType=login&dataCenter=Wash%20DC
//
EPISODES.sendBeacon = function(url, params) {
	url = url || EPISODES.beaconUrl;
	var measures = EPISODES.getMeasures();
	var sTimes = "";
	for ( var key in measures ) {
		sTimes += "," + escape(key) + ":" + measures[key];
	}

	if ( sTimes ) {
	    // strip the leading ","
		sTimes = sTimes.substring(1);

		// Add user's params
		if ( params ) {
			for (var key in params) {
				if ( params.hasOwnProperty(key) ) {
					sTimes += "&" + escape(key) + "=" + escape(params[key]);
				}
			}
		}

		img = new Image();
		img.src = url + "?ets=" + sTimes + "&v=" + EPISODES.version;
	    return img.src;
	}

    return "";
};


// Use various techniques to determine the time at which this page started.
EPISODES.findStartTime = function() {
	var startTime = EPISODES.findStartWebTiming() || EPISODES.findStartCookie();
	if ( startTime ) {
		EPISODES.mark("starttime", startTime);
	}
};


// Find the start time from the Web Timing "performance" object.
// http://test.w3.org/webperf/specs/NavigationTiming/
// http://blog.chromium.org/2010/07/do-you-know-how-slow-your-web-page-is.html
EPISODES.findStartWebTiming = function() {
	var startTime = undefined;

	var performance = window.performance || window.mozPerformance || window.msPerformance || window.webkitPerformance;
 
	if ( "undefined" != typeof(performance) && "undefined" != typeof(performance.timing) && "undefined" != typeof(performance.timing["navigationStart"]) ) {
		startTime = performance.timing["navigationStart"];
		EPISODES.dprint("EPISODES.findStartWebTiming: startTime = " + startTime);
	}

	return startTime;
};


// Find the start time based on a cookie set by Episodes in the unload handler.
EPISODES.findStartCookie = function() {
	var aCookies = document.cookie.split(' ');
	for ( var i = 0; i < aCookies.length; i++ ) {
		if ( 0 === aCookies[i].indexOf("EPISODES=") ) {
			var aSubCookies = aCookies[i].substring("EPISODES=".length).split('&');
			var startTime, bReferrerMatch;
			for ( var j = 0; j < aSubCookies.length; j++ ) {
				if ( 0 === aSubCookies[j].indexOf("s=") ) {
					startTime = aSubCookies[j].substring(2);
				}
				else if ( 0 === aSubCookies[j].indexOf("r=") ) {
					var startPage = aSubCookies[j].substring(2);
					bReferrerMatch = ( escape(document.referrer) == startPage );
				}
			}
			if ( bReferrerMatch && startTime ) {
				EPISODES.dprint("EPISODES.findStartCookie: startTime = " + startTime);
				return startTime;
			}
		}
	}

	return undefined;
};



// Set a cookie when the page unloads. Consume this cookie on the next page to get a "start time".
// Doesn't work in some browsers (Opera).
EPISODES.beforeUnload = function(e) {
	document.cookie = "EPISODES=s=" + Number(new Date()) + "&r=" + escape(document.location) + "; path=/";
};


// When the page is done do final wrap-up.
EPISODES.onload = function(e) {
	EPISODES.mark("onload");

	if ( EPISODES.autorun ) {
		EPISODES.done();
	}
};


// Helper function to draw a picture of the Episodes.
// Sets the innerHTML of parent.
EPISODES.drawEpisodes = function(parent, bMarks) {
	if ( ! parent ) {
		return;
	}
	if ( "undefined" === typeof(bMarks) ) {
		bMarks = 1;
	}

	// Put the episodes (and marks) in order by start time and duration.
	// Create an array that we'll sort with special function.
	var starts = EPISODES.getStarts();
	var measures = EPISODES.getMeasures();
	var marks = EPISODES.getMarks();
	var aEpisodes = new Array(); // each element is an array: [start, end, name]
	for ( var episodeName in measures ) {
		if ( measures.hasOwnProperty(episodeName) ) {
			var start = starts[episodeName];
			aEpisodes.push([ start, start + measures[episodeName], episodeName ]);
		}
	}
	for ( var episodeName in marks ) {
		if ( marks.hasOwnProperty(episodeName) ) {
			if ( "undefined" === typeof(measures[episodeName]) ) {
				// Only add the mark if it is NOT an episode.
				var start = marks[episodeName];
				aEpisodes.push([ start, start, episodeName ]);
			}
		}
	}
	aEpisodes.sort(EPISODES.sortEpisodes);

	// Find start and end of all episodes.
	var tFirst = aEpisodes[0][0];
	var tLast = aEpisodes[0][1];
	var len = aEpisodes.length;
	for ( var i = 1; i < len; i++ ) {
		if ( aEpisodes[i][1] > tLast ) {
			tLast = aEpisodes[i][1];
		}
	}

	// Create HTML to represent the episodes.
	var nPixels = parent.clientWidth || parent.offsetWidth;
	var PxlPerMs = nPixels / (tLast - tFirst);
    var sHtml = "";
	for ( var i = 0; i < aEpisodes.length; i++ ) {
		var start = aEpisodes[i][0];
		var end = aEpisodes[i][1];
		var delta = end - start;
		var episodeName = aEpisodes[i][2];
		var leftPx = parseInt(PxlPerMs * (start - tFirst)) + 40;
		var widthPx = parseInt(PxlPerMs * delta);
		sHtml += '<div style="font-size: 10pt; position: absolute; left: ' + leftPx + 
		    'px; top: ' + (i*30) + 'px; width: ' + widthPx + 'px; height: 16px;">' +
            '<div style="background: #EEE; border: 1px solid; padding-bottom: 2px;"><nobr style="padding-left: 4px;">' + episodeName + 
			( 0 < delta ? ' - ' + delta + 'ms' : '' ) +
			'</nobr></div></div>\n';
	}

	parent.innerHTML = sHtml;
}


EPISODES.sortEpisodes = function(a, b) {
	if ( a[0] == b[0] ) {
		if ( a[1] == b[1] ) {
			return 0;
		}
		if ( a[1] > b[1] ) {
			return -1;
		}
		return 1;
	}
	if ( a[0] < b[0] ) {
		return -1;
	}

	return 1;
};



// Wrapper for addEventListener and attachEvent.
EPISODES.addEventListener = function(sType, callback, bCapture) {
	if ( "undefined" != typeof(window.attachEvent) ) {
		return window.attachEvent("on" + sType, callback);
	}
	else if ( window.addEventListener ){
		return window.addEventListener(sType, callback, bCapture);
	}
};


// Wrapper for debug log function.
if ( "undefined" != typeof(console) && "undefined" != typeof(console.log) ) {
	EPISODES.dprint = function(msg) { console.log(msg); };
}
else {
	EPISODES.dprint = function(msg) { };
}


EPISODES.init();
