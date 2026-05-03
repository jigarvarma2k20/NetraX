// This file is part of NetraX.
// Repository: https://github.com/jigarvarma2k20/NetraX
//
// Copyright (c) 2026 NetraX Contributors
//
// SPDX-License-Identifier: GPL-3.0

package ports

import (
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
)

const (
	DefaultProxyAddress = "127.0.0.1"
	DefaultProxyPort    = 8080
)

type ProxyBinding struct {
	Address string `json:"address"`
	Port    int    `json:"port"`
}

type BindingAvailability struct {
	Address   string `json:"address"`
	Port      int    `json:"port"`
	Available bool   `json:"available"`
	Error     string `json:"error,omitempty"`
}

func ResolveBindings(bindings []ProxyBinding, legacyAddr string, legacyPort int) ([]ProxyBinding, error) {
	candidate := bindings
	if len(candidate) == 0 {
		candidate = []ProxyBinding{{
			Address: legacyAddr,
			Port:    legacyPort,
		}}
	}

	unique := make(map[string]ProxyBinding, len(candidate))
	for _, b := range candidate {
		normalized, err := normalizeBinding(b)
		if err != nil {
			return nil, err
		}
		key := bindingKey(normalized)
		unique[key] = normalized
	}

	resolved := make([]ProxyBinding, 0, len(unique))
	for _, b := range unique {
		resolved = append(resolved, b)
	}

	sort.Slice(resolved, func(i, j int) bool {
		if resolved[i].Address == resolved[j].Address {
			return resolved[i].Port < resolved[j].Port
		}
		return resolved[i].Address < resolved[j].Address
	})

	if len(resolved) == 0 {
		resolved = []ProxyBinding{{Address: DefaultProxyAddress, Port: DefaultProxyPort}}
	}

	return resolved, nil
}

func FirstBinding(bindings []ProxyBinding) ProxyBinding {
	if len(bindings) == 0 {
		return ProxyBinding{Address: DefaultProxyAddress, Port: DefaultProxyPort}
	}
	return bindings[0]
}

func ListenAddress(binding ProxyBinding) string {
	normalized := binding
	if strings.TrimSpace(normalized.Address) == "" {
		normalized.Address = DefaultProxyAddress
	}
	if normalized.Port <= 0 {
		normalized.Port = DefaultProxyPort
	}
	return net.JoinHostPort(normalized.Address, strconv.Itoa(normalized.Port))
}

func CheckAvailability(bindings []ProxyBinding) []BindingAvailability {
	return CheckAvailabilityWithActive(bindings, nil)
}

func CheckAvailabilityWithActive(bindings []ProxyBinding, activeBindings []ProxyBinding) []BindingAvailability {
	results := make([]BindingAvailability, 0, len(bindings))

	for _, binding := range bindings {
		normalized, err := normalizeBinding(binding)
		if err != nil {
			results = append(results, BindingAvailability{
				Address:   binding.Address,
				Port:      binding.Port,
				Available: false,
				Error:     err.Error(),
			})
			continue
		}

		addr := ListenAddress(normalized)
		listener, listenErr := net.Listen("tcp", addr)
		if listenErr != nil {
			if conflictsWithActiveBinding(normalized, activeBindings) {
				results = append(results, BindingAvailability{
					Address:   normalized.Address,
					Port:      normalized.Port,
					Available: true,
				})
				continue
			}

			results = append(results, BindingAvailability{
				Address:   normalized.Address,
				Port:      normalized.Port,
				Available: false,
				Error:     listenErr.Error(),
			})
			continue
		}

		_ = listener.Close()
		results = append(results, BindingAvailability{
			Address:   normalized.Address,
			Port:      normalized.Port,
			Available: true,
		})
	}

	return results
}

func conflictsWithActiveBinding(candidate ProxyBinding, activeBindings []ProxyBinding) bool {
	for _, active := range activeBindings {
		normalizedActive, err := normalizeBinding(active)
		if err != nil {
			continue
		}

		if normalizedActive.Port != candidate.Port {
			continue
		}

		if normalizedActive.Address == candidate.Address || isWildcardAddress(normalizedActive.Address) || isWildcardAddress(candidate.Address) {
			return true
		}
	}

	return false
}

func isWildcardAddress(address string) bool {
	trimmed := strings.TrimSpace(address)
	return trimmed == "0.0.0.0" || trimmed == "::" || trimmed == "[::]"
}

func normalizeBinding(binding ProxyBinding) (ProxyBinding, error) {
	address := strings.TrimSpace(binding.Address)
	if address == "" {
		address = DefaultProxyAddress
	}

	port := binding.Port
	if port == 0 {
		port = DefaultProxyPort
	}
	if port < 1 || port > 65535 {
		return ProxyBinding{}, fmt.Errorf("invalid port %d: must be in range 1-65535", port)
	}

	return ProxyBinding{
		Address: address,
		Port:    port,
	}, nil
}

func bindingKey(binding ProxyBinding) string {
	return binding.Address + ":" + strconv.Itoa(binding.Port)
}
