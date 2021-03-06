/**
 * Dashboard State.
 */
dash = {
    // Default settings, can be changed by settings panel.
    serverHostName: "localhost",
    serverPort: "5556",
    query: "true",
    services: {},

    // internal state
    socket: null,
    events: {},
    context: null,
    updateFn: null
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
    var uri = "ws://" + this.serverHostName + ":"
        + this.serverPort
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
        if(!(dash.events[host] && dash.events[host][service])) {
            // This metric is no-longer valid - return NaN sequence.
            return _((stop - start) / step).times(function(n) {return NaN;});
        }

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
            var nextMetric = _.last(values) || NaN;
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
    return _.chain(dash.events[host])
            .keys()
            .filter(dash.serviceState)
            .sortBy(function(s){return s;})
            .map(function(s) {
                return eventsMetric(host, s, dash.context);
            })
            .value();
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

        var hosts = d3.select("#time-series-container")
                      .selectAll(".host-section")
                      .data(_.chain(dash.events)
                             .keys()
                             .reject(function(host) {return host == "undefined";})
                             .sortBy(_.identity)
                             .value(),
                           _.identity);

        hosts.exit().remove();
        hosts.enter().append("div")
                     .attr("class", "host-section")
                     .append("span")
                     .attr("class", "lead")
                     .text(function(d) {return d});

        var services = d3.selectAll(".host-section")
                         .selectAll(".horizon")
                         .data(metricsForHost, _.identity);

        services.exit().remove();
        services.enter().append("div")
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
    return _.chain(dash.events)
            .values()
            .map(_.keys)
            .reduce(function(x, y) {return x.concat(y);})
            .uniq()
            .sort()
            .value();
}

/**
 * Update the active services and chart view following
 * changes to settings.
 */
dash.settingsUpdate = function() {
    dash.serverHostName = d3.select("#server-config-host-input").property("value");
    dash.serverPort = d3.select("#server-config-port-input").property("value");
    dash.query = d3.select("#query-input").property("value");

    d3.select("#settings-active-services")
      .selectAll(".service-checkbox")
      .each(function(service) {
          dash.services[service] = this.checked;
      });

    this.forceRefresh();
}

/**
 * Check the visibility settings for this service. If the
 * service is not (yet) known to the dash, return true so
 * that it is initially rendered, until the user specifies
 * otherwise.
 */
dash.serviceState = function(service) {
    return dash.services[service] == undefined
           || dash.services[service];
}

/**
 * Load the settings form state from dash object.
 */
function restoreSettingsForm() {
    d3.select("#server-config-host-input")
      .attr("value", dash.serverHostName);

    d3.select("#server-config-port-input")
      .attr("value", dash.serverPort);

    d3.select("#query-input")
      .attr("value", dash.query);

    d3.select("#settings-active-services")
        .selectAll(".service-selector")
        .data(dash.uniqueServices())
        .enter()
        .append("div")
        .classed("service-selector", true)
        .each(function(d) {
            d3.select(this)
                .append("input")
                .attr("type", "checkbox")
                .attr("class", "service-checkbox")
                .attr("checked", dash.serviceState(d) ? "checked" : null);

            d3.select(this)
                .append("span")
                .attr("class", "service-label")
                .text(d);
        });
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
              restoreSettingsForm();
          }
      });

    d3.select("#services-select-all-input")
      .on("click", function(d, i) {
          var state = this.checked;
          d3.selectAll(".service-checkbox")
            .each(function(d, i) {
                this.checked = state;
            });
      });

    d3.select("#clear-event-buffers-input")
      .on("click", function(d, i) {
          dash.clearBuffers();
      });
}

/**
 * Delete recorded event data from buffers and reconnect.
 */
dash.clearBuffers = function() {
    this.socket.close();
    this.events = {};
    this.forceRefresh();
}

/**
 * Force reconnection of the query and redraw of charts.
 */
dash.forceRefresh = function() {
    if(this.socket) this.socket.close();
    this.openQuery();
    this.updateFn = chartsUpdater(dash.context);
    this.updateFn();
}

/**
 * call from body onLoad, after scripts loaded.
 */
dash.onLoad = function () {
    dash.context = cubism.context()
        .size(window.innerWidth)
        .step(500);

    initSettings();
    setupChartArea();
    this.forceRefresh();
    window.setInterval(function() {dash.updateFn()}, 5000);
}
