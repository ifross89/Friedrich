(ns bernhard.handler
  "Simple Compojure/Ring handler to host the static pages."
  (:require [compojure.core     :refer :all]
            [compojure.handler  :as handler]
            [compojure.route    :as route]
            [ring.util.response :as response]))

(defroutes app-routes
  (ANY "/" [] (response/redirect "index.html"))
  (route/resources "/")
  (route/not-found "Not Found"))

(def app
  (handler/site app-routes))
