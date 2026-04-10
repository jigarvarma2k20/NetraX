package parser

import (
	"encoding/json"
	"net/http"
)

func HeadersToJSON(h any) (string, error) {
	b, err := json.Marshal(h)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func HeadersFromJSON(s string) (http.Header, error) {
	var h http.Header
	err := json.Unmarshal([]byte(s), &h)
	return h, err
}
