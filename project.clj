(defproject friedrich "0.1.0-SNAPSHOT"
  :description  "Riemann Time-series visualization with Cubism."
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [compojure "1.1.5"]]
  :plugins      [[lein-ring "0.8.2"]]
  :ring         {:handler friedrich.handler/app})
