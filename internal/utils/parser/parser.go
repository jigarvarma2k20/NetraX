// This file is part of NetraX.
// Repository: https://github.com/jigarvarma2k20/NetraX
//
// Copyright (c) 2026 NetraX Contributors
//
// SPDX-License-Identifier: GPL-3.0

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
