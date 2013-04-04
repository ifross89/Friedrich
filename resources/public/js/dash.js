/**
 * Dashboard State.
 */
dash = {
    // Riemann server base URL for WebSockets API
    baseURL: "ws://localhost:5556",

    // Events received from Riemann.
    eventBuffer: []
};

/**
 * Call Riemann's query API, returning open WebSocket object.'
 */
dash.openQuerySocket = function(query, message_fn) {
    var uri = this.baseURL
        + "/index"
        + "?subscribe=true"
        + "&query=" + encodeURIComponent(query);

    var s = new WebSocket(uri);
    s.onmessage = message_fn;
    return s;
}

/**
 * Cubism "metric" function to bucketize events in the buffer
 * and format them for rendering in the graph.
 */
function cpuMetric(context) {
    return context.metric(function(start, stop, step, callback) {
        values = [];
        start = +start;
        stop = +stop;

        // Delete old events
        while(dash.eventBuffer.length > 0
              && dash.eventBuffer[0] < start) {
            dash.eventBuffer.shift();
        }

        var eventIndex = 0;
        for(; start <= stop; start += step) {
            var nextMetric = 0;
            var bucket = [];

            for(; eventIndex < dash.eventBuffer.length
               && dash.eventBuffer[eventIndex].time < start + step; ++eventIndex) {
                bucket.push(dash.eventBuffer[eventIndex].metric);
            }

            if(bucket.length > 0) {
                nextMetric = bucket.reduce(function(x, y) {return x + y;}, 0)
                    / bucket.length;
            }

            values.push(nextMetric);
        }

        callback(null, values);
    });
}

var data = ["CPU", "Blah"];
dash.makeChart = function() {
    var context = cubism.context()
                        .size(900)
                        .step(1000);

    var horizon = context.horizon()
                         .height(150)
                         .extent([0, 0.25]);

    var met = cpuMetric(context);
    horizon.metric(met);

    d3.select("#time-series-container").selectAll(".axis")
        .data(["top", "bottom"])
        .enter().append("div")
        .attr("class", function(d) {return d + " axis"})
        .each(function(d) {d3.select(this).call(context.axis().ticks(12).orient(d)); });

    d3.select("#time-series-container").append("div")
        .attr("class", "rule")
        .call(context.rule());

    d3.select("#time-series-container")
        .selectAll(".horizon")
        .data(data)
        .enter().append("div")
                .attr("class", "horizon")
                .call(horizon);
}

dash.onLoad = function () {
    this.testQuery();
    this.makeChart();
}


// Test crap
dash.testQuery = function() {
    this.openQuerySocket("tagged \"foo\"", function(m) {
        var data = JSON.parse(m.data);

        if (data.service == "cpu") {
            dash.eventBuffer.push({metric: data.metric,
                                   time:   +Date.parse(data.time)});
        }
    });
}

dash.randomMetric = function(context) {
    return context.metric(function(start, stop, step, callback) {

        var values = [];

        // convert start & stop to milliseconds
        start = +start;
        stop = +stop;

        while (start < stop) {
            start += step;
            values.push(Math.random());
        }

        callback(null, values);
    });
}
