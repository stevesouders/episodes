<!doctype html>
<html>
<head>
<title>Web Episodes</title>
<meta charset="UTF-8">

<script>
var EPISODES = EPISODES || {};
EPISODES.q = []; // command queue
EPISODES.mark = function(mn, mt) { EPISODES.q.push( ["mark", mn, mt || new Date().getTime()] ); };
EPISODES.mark("firstbyte");
</script>
<script async defer src="episodes.js"></script>


<style>
BODY { font-family: arial; width: 900px; }
</style>
</head>
<body>

<div style="float: right; font-size: 0.9em;">
<a href="https://github.com/stevesouders/episodes">code</a>
</div>
<h1>Web Episodes</h1>

<p style="margin-bottom: 0;">
<i>Web Episodes</i> is a script for gathering Real User Measurement (RUM) performance timings from web pages.
The key aspects of <i>Web Episodes</i> are:
<ul>
  <li> it loads asynchronously
  <li> it supports <a href="http://www.w3.org/TR/navigation-timing/">Navigation Timing</a> and <a href="http://www.w3.org/TR/resource-timing/">Resource Timing</a>
  <li> it supports measuring Web 2.0 applications
  <li> measurements are made using JavaScript events so there can be multiple listeners
  <li> it's designed to be an industry standard for web developers, web metrics service providers, tool developers, and browser developers
  <li> it's open source
</ul>

<p style="margin-bottom: 0;">
Examples:
</p>
<ul style="margin-top: 0;">
  <li> <a href="ex1.html">example 1</a> - a simple example using default settings
</ul>

<p>
See these <a href="http://ajaxexperience.techtarget.com/conference/html/performance.html#SSoudersFast">slides</a> for more information.
</p>

</body>

</html>
