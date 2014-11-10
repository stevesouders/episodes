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

Embed this snippet in your page:
    <script async defer src="/js/episodes.js"></script>

For more complex use of EPISODES you might need to add these stub functions:
    <script>
    var EPISODES = EPISODES || {};
    EPISODES.q = [];                      // command queue
    EPISODES.mark = function(mn, mt) { EPISODES.q.push( ["mark", mn, mt || new Date().getTime()] ); };
    EPISODES.measure = function(en, st, en) { EPISODES.q.push( ["measure", en, st, en || new Date().getTime()] ); };
    </script>
    <script async defer src="/js/episodes.js"></script>

*/


var EPISODES = EPISODES || {};  // EPISODES namespace
EPISODES.q = EPISODES.q || [];  // command queue

EPISODES.setDefault = function(param, val) {
    if ( "undefined" == typeof(EPISODES[param]) ) {
            EPISODES[param] = val;
    }

    return EPISODES[param];
};


// OPTIONS
EPISODES.setDefault("bSendBeacon", 0);         // 1 == beacon back the resulting metrics
EPISODES.setDefault("beaconUrl", '/images/beacon.gif');  // URL to use for the metrics beacon
EPISODES.setDefault("bResourceTimingAgg", 1);  // 1 == include Resource Timing aggregate stats.
EPISODES.setDefault("autorun", 1);             // 1 == finish collecting metrics at window.onload

// other settings
EPISODES.targetOrigin = document.location.protocol + "//" + document.location.hostname;
EPISODES.bPostMessage = ("undefined" != typeof(window.postMessage));
EPISODES.version = "0.3";


EPISODES.init = function() {
    EPISODES.bDone = false;
    EPISODES.marks = {};
    EPISODES.measures = {};
    EPISODES.starts = {};  // We need to save the starts so that given a measure we can say the epoch times that it began and ended.
    EPISODES.hResourceTiming = undefined;
    EPISODES.findStartTime();
    EPISODES.addEventListener("beforeunload", EPISODES.beforeUnload, false);

    // Process any commands that have been queued up while episodes.js loaded asynchronously.
    EPISODES.processQ();

    if ( "complete" == document.readyState ) {
        // The page is ALREADY loaded - start EPISODES right now.
        if ( "undefined" != typeof(performance) && "undefined" != typeof(performance.timing) && 
             "undefined" != typeof(performance.timing["loadEventEnd"]) ) {
            // Fill in predefined marks from Nav Timing:
            EPISODES.mark("firstbyte", performance.timing.responseStart);
            EPISODES.mark("onload", performance.timing.loadEventEnd);
        }
        if ( EPISODES.autorun ) {
            EPISODES.done();
        }
    }
    else {
        // Start EPISODES on onload.
        EPISODES.addEventListener("load", EPISODES.onload, false);
    }
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


// In the case of Ajax or post-onload episodes, call "done()" to signal the end of episodes.
EPISODES.done = function(callback) {
    EPISODES.bDone = true;

    EPISODES.mark("done");

    if ( EPISODES.bResourceTimingAgg ) {
        EPISODES.measureResources();
    }

    if ( EPISODES.bSendBeacon ) {
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

        // Add resource timings
        if ( EPISODES.hResourceTiming ) {
            for (var key in EPISODES.hResourceTiming) {
                if ( EPISODES.hResourceTiming.hasOwnProperty(key) ) {
                    var hKey = EPISODES.hResourceTiming[key];
                    if ( 0 < hKey['num'] ) {
                        sTimes += "&rt_" + escape(key) + "=" + hKey['num'] + "," + hKey['max'] + "," + hKey['med'] + "," + hKey['avg'];
                    }
                }
            }

            if ( EPISODES.slowestEntry ) {
                var hTimes = EPISODES.getResourceTiming(EPISODES.slowestEntry);
                sTimes += "&slowest=" + encodeURIComponent(EPISODES.slowestEntry.name) + 
                    "," + hTimes.dur +
                    "," + ( hTimes.download || "na" ) +
                    "," + ( hTimes.dns || "na" ) +
                    "," + ( hTimes.tcp || "na" ) +
                    "," + ( hTimes.ssl || "na" ) +
                    "," + ( hTimes.ttfb || "na" ) +
                    "," + ( hTimes.content || "na" );
                    
            }
        }

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
EPISODES.findStartWebTiming = function() {
    var startTime = undefined;

    var performance = window.performance;
 
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
// Does not work in some browsers (Opera).
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


// Gather aggregate stats for all the resources in EPISODES.hResourceTiming.
EPISODES.measureResources = function() {
    if ( !("performance" in window) || !window.performance || !window.performance.getEntriesByType ) {
        // Bail if Resource Timing is not supported.
        return;
    }

    EPISODES.bAllDomains = true;
    if ( EPISODES.aDomains && 0 < EPISODES.aDomains.length ) {
        // If we have a list of domains, then only look at those resources.
        EPISODES.bAllDomains = false;
        EPISODES.numDomains = EPISODES.aDomains.length;

        // Handle wildcard domains: we convert the domain names to regex format.
        for ( var i = 0; i < EPISODES.numDomains; i++ ) {
            var domain = EPISODES.aDomains[i];
            if ( 0 === domain.indexOf("*.") ) {
                // If there's a wildcard we have to add a new domain for JUST the top- & second-level-domain values.
                EPISODES.aDomains.push("^" + domain.replace(/^\*\./, "") + "$");
            }
            EPISODES.aDomains[i] = "^" + domain.replace(/\./g, "\\.").replace(/^\*\\\./, ".*\\.") + "$"; // backslash all "." and change "*." to "."
        }
        EPISODES.numDomains = EPISODES.aDomains.length; // update the value since we might have added new ones
    }

    // Record timing metrics for each appropriate resource.
    var aDns=[], aDnsNz=[], aSsl=[], aSslNz=[], aTcp=[], aTcpNz=[], aTtfb=[], aTtfbNz=[], aContent=[], aContentNz=[], aDur=[], aDurNz=[], aDownload=[], aDownloadNz=[];
    var aEntries = performance.getEntriesByType("resource");
    for ( var i = 0, len=aEntries.length, maxSlow = 0; i < len; i++ ) {
        var entry = aEntries[i];
        if ( EPISODES.domainMatch(entry) ) {
            var hTimes = EPISODES.getResourceTiming(entry);
            var t = hTimes.dur;
            aDur.push( t ); // we ALWAYS have a duration
            if ( t ) { aDurNz.push( t ); }

            if ( "undefined" !== typeof(t = hTimes.download) ) {
                aDownload.push( t );
                if ( t ) { aDownloadNz.push( t ); }
                if ( t > maxSlow ) {
                    maxSlow = t;
                    EPISODES.slowestEntry = entry;
                }
            }
            if ( "undefined" !== typeof(t = hTimes.dns) ) {
                aDns.push( t );
                if ( t ) { aDnsNz.push( t ); }
            }
            if ( "undefined" != typeof(t = hTimes.tcp) ) {
                aTcp.push( t );
                if ( 0 < t ) { aTcpNz.push( t ); }
            }
            if ( "undefined" != typeof(t = hTimes.ttfb) ) {
                t = hTimes.ttfb;
                aTtfb.push( t );
                if ( 0 < t ) { aTtfbNz.push( t ); }
            }
            if ( "undefined" != typeof(t = hTimes.content) ) {
                t = hTimes.content;
                aContent.push( t );
                if ( 0 < t ) { aContentNz.push( t ); }
            }
            if ( "undefined" != typeof(t = hTimes.ssl) ) {
                aSsl.push( t );
                if ( 0 < t ) { aSslNz.push( t ); }
            }
        }
    }

    // compute aggregate stats
    EPISODES.hResourceTiming = {};
    EPISODES.aggStats(EPISODES.hResourceTiming, 'dns', aDns);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'dnsnz', aDnsNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'tcp', aTcp);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'tcpnz', aTcpNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'ssl', aSsl);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'sslnz', aSslNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'ttfb', aTtfb);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'ttfbnz', aTtfbNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'content', aContent);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'contentnz', aContentNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'dur', aDur);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'durnz', aDurNz);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'download', aDownload);
    EPISODES.aggStats(EPISODES.hResourceTiming, 'downloadnz', aDownloadNz);
};


// return a hash of calculated times
EPISODES.getResourceTiming = function(entry) {
    var hTimes = {};
    hTimes.dur = Math.round(entry.duration);

    // Make sure we have access to the cross-domain restricted properties.
    if ( 0 != entry.requestStart ) {
        hTimes.dns = Math.round(entry.domainLookupEnd - entry.domainLookupStart);
        hTimes.tcp = Math.round(entry.connectEnd - entry.connectStart);
        hTimes.ttfb = Math.round(entry.responseStart - entry.requestStart);
        hTimes.content = Math.round(entry.responseEnd - entry.responseStart);
        hTimes.download = hTimes.dns + hTimes.tcp + hTimes.ttfb + hTimes.content;
        if ( entry.secureConnectionStart ) {
            // secureConnectionStart can be "undefined" or "0"
            hTimes.ssl = Math.round(entry.connectEnd - entry.secureConnectionStart);
        }
    }

    return hTimes;
};

// Return true if the resource entry's domain matches the domain we're supposed to measure.
EPISODES.domainMatch = function(entry) {
    if ( EPISODES.bAllDomains ) {
        return true;
    }

    // Actually test the domain. 
    if ( ! EPISODES.tmpA ) {
        EPISODES.tmpA = document.createElement('a'); // we re-use this anchor element to help parse URLs
    }

    tmpA.href = entry.name; // do this for easier parsing
    var hostname = tmpA.hostname;
    for ( var j = 0; j < EPISODES.numDomains; j++ ) {
        if ( hostname.match(EPISODES.aDomains[j]) ) {
            return true;
        }
    }

    return false;
};


EPISODES.aggStats = function(h, name, a) {
    h[name] = {};
    h[name]['num'] = a.length;
    if ( a.length ) {
        a.sort(EPISODES.sortDesc);
        h[name]['max'] = EPISODES.arrayMax(a, true);
        h[name]['med'] = EPISODES.arrayMed(a, true);
        h[name]['avg'] = EPISODES.arrayAvg(a);
    }
};


// use this with the array sort() function to sort numbers
EPISODES.sortDesc = function(a,b) {
    return b - a;
}


// return the max value from an array
// if bDesc == true then the array is presumed to be in descending order
EPISODES.arrayMax = function(a, bDesc) {
    return ( bDesc ? a[0] : a.sort(EPISODES.sortDesc)[0] );
};


// return the median value from an array
// if bDesc == true then the array is presumed to be in descending order
EPISODES.arrayMed = function(a, bDesc) {
    if ( ! bDesc ) {
        a.sort(EPISODES.sortDesc);
    }

    var len = a.length;
    if ( 0 == len ) {
        return undefined;
    }

    var middle = Math.floor(len / 2);
    if ( 2*middle == len ) {
        // even number of elements
        return Math.round( (a[middle-1] + a[middle])/2 );
    }
    else {
        // odd number of elements
        return a[middle];
    }
};


// return the average of an array of numbers
EPISODES.arrayAvg = function(a) {
    var len = a.length;
    var sum = 0;
    for ( var i = 0; i < len; i++ ) {
        sum += a[i];
    }

    return Math.round(sum/len);
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
