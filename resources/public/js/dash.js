/**
 * Dashboard State.
 */
dash = {
    // Riemann server base URL for WebSockets API
    baseURL: "ws://localhost:5556",

    // Query state
    query: "true",
    socket: null,

    // Events received from Riemann.
    events: {},

    // Cubism context
    context: null
};

//
// WebSocket handler functions.
//

function socketOnMessage(msg) {
    if(! msg.data) {
        console.log("Ignoring bad message from WebSocket: " + msg);
    }

    var event = JSON.parse(msg.data);
    dash.addEvent(event);
}

function socketOnError(err) {
    console.log("WebSocket Error: " + err);
}

function socketOnOpen() {
    console.log("Websocket opened.");
}

function socketOnClose() {
    console.log("WebSocket closed.");
}

/**
 * Adds event e to the events log, indexed by host then service.
 */
dash.addEvent = function(e) {
    if(! this.events[e.host]) {
        this.events[e.host] = {};
    }

    if(! this.events[e.host][e.service]) {
        this.events[e.host][e.service] = [];
    }

    // Convert time to milliseconds when adding to buffers.
    this.events[e.host][e.service].push({time:   +Date.parse(e.time),
                                         metric: e.metric});
}

/**
 * Call Riemann's query API, setting this.socket to the
 * open WebSocket object.
 */
dash.openQuery = function() {
    var uri = this.baseURL
        + "/index"
        + "?subscribe=true"
        + "&query=" + encodeURIComponent(this.query);

    this.socket = new WebSocket(uri);
    this.socket.onmessage = socketOnMessage;
    this.socket.onerror = socketOnError;
    this.socket.onopen = socketOnOpen;
    this.socket.onclose = socketOnClose;
}

/**
 * Cubism "metric" function to bucketize events in the buffer
 * and format them for rendering in the graph.
 */
function eventsMetric(host, service, context) {
    return context.metric(function(start, stop, step, callback) {
        var eventBuffer = dash.events[host][service];

        values = [];
        start = +start;
        stop = +stop;

        // Delete old events
        while(eventBuffer.length > 0
              && eventBuffer[0] < start) {
            eventBuffer.shift();
        }

        var eventIndex = 0;
        for(; start <= stop; start += step) {
            var nextMetric = NaN;
            var bucket = [];

            for(; eventIndex < eventBuffer.length
               && eventBuffer[eventIndex].time < start + step; ++eventIndex) {
                bucket.push(eventBuffer[eventIndex].metric);
            }

            if(bucket.length > 0) {
                nextMetric = bucket.reduce(function(x, y) {return x + y;}, 0)
                    / bucket.length;
            }

            values.push(nextMetric);
        }

        callback(null, values);
    }, service);
}

/**
 * Return a collection of metric functions for the given host's
 * set of services in the events index.
 */
function metricsForHost(host) {
    return _.map(_.sortBy(_.keys(dash.events[host]),
                          function(service) {return service;}),
                 function(service) {
                     return eventsMetric(host, service, dash.context);
                 });
}

/**
 * Return a function to be called at some interval, which checks for as-yet
 * uncharted hosts/services and adds them to the dashboard. Note that no
 * graphs appear at all until this has been called at least once while there
 * was data in dash.events.
 */
function chartsUpdater(context) {
    return function() {
        var horizon = context.horizon()
            .height(30);

        d3.select("#time-series-container")
            .selectAll(".host-section")
            .data(_.sortBy(_.reject(_.keys(dash.events),
                                   function(h) {return h == "undefined";}),
                         function(host) {return host;}))
            .enter().append("div")
                    .attr("class", "host-section")
                    .append("span")
                    .attr("class", "lead")
                    .text(function(d) {return d});

        d3.selectAll(".host-section")
            .selectAll(".horizon")
            .data(metricsForHost)
            .enter().append("div")
                    .attr("class", "horizon")
                    .call(horizon);
    }
}

/**
 * Setup the axis and rule. This is only done once, as it shouldn't change.
 */
function setupChartArea() {
    d3.select("#time-series-container").selectAll(".axis")
        .data(["top", "bottom"])
        .enter().append("div")
        .attr("class", function(d) {return d + " axis"})
        .each(function(d) {
            d3.select(this).call(dash.context.axis().ticks(12).orient(d));
        });

    d3.select("#time-series-container")
        .append("div")
        .attr("class", "rule")
        .call(dash.context.rule());
}

/**
 * Return an array of all the unique service names in
 * the current dash.events index, across all hosts.
 */
dash.uniqueServices = function() {
    return _.uniq(
        _.reduce(
            _.map(_.values(this.events), _.keys),
            function(x, y) {
                return x.concat(y);
            }, []));
}

/**
 * Update the active services and chart view following
 * changes to settings.
 */
dash.settingsUpdate = function() {
    console.log("Updating settings...");
}

/**
 * Set up the state toggle for the settings button.
 */
function initSettings() {
    d3.select("#settings-icon")
      .on("click", function(d, i) {
          var isVisible = d3.select("#settings-form").style("display") != "none";

          d3.select("#settings-background")
              .classed("settings-button", isVisible)
              .classed("settings-full", !isVisible);

          d3.select("#settings-form")
            .style("display", isVisible ? "none" : "block");

          if (isVisible) {
              // View is closing, so register changes.
              dash.settingsUpdate();
          } else {
              // View is opening, load active services state.
              d3.select("#settings-active-services")
                .selectAll(".service-selector")
                .data(dash.uniqueServices())
                .enter()
                  .append("div")
                  .classed("service-selector", true)
                  .each(function(d) {
                      d3.select(this)
                          .append("input")
                          .attr("type", "checkbox");

                      d3.select(this).text(d);
                  });
          }
      });
}

/**
 * call from body onLoad, after scripts loaded.
 */
dash.onLoad = function () {
    dash.context = cubism.context()
        .size(window.innerWidth)
        .step(1000);

    initSettings();
    this.openQuery();
    setupChartArea();
    window.setInterval(chartsUpdater(dash.context), 5000);
}
