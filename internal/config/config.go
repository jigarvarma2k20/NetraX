// This file is part of NetraX.
// Repository: https://github.com/jigarvarma2k20/NetraX
//
// Copyright (c) 2026 NetraX Contributors
//
// SPDX-License-Identifier: GPL-3.0

package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"os"
	"path/filepath"
	"time"

	"github.com/jigarvarma2k20/netrax/internal/core/ports"
)

type Settings struct {
	ProxyPort     int                  `json:"proxyPort"`
	ProxyAddr     string               `json:"proxyAddr"`
	ProxyBindings []ports.ProxyBinding `json:"proxyBindings,omitempty"`
}

var defaultSettings = Settings{
	ProxyPort:     ports.DefaultProxyPort,
	ProxyAddr:     ports.DefaultProxyAddress,
	ProxyBindings: []ports.ProxyBinding{{Address: ports.DefaultProxyAddress, Port: ports.DefaultProxyPort}},
}

func GetConfigDir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	netraxDir := filepath.Join(configDir, "netrax")
	err = os.MkdirAll(netraxDir, 0755)
	if err != nil {
		return "", err
	}
	return netraxDir, nil
}

func GetSettingsPath() (string, error) {
	dir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

func GetCertPath() (string, error) {
	dir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "netraxCA.crt"), nil
}

func GetKeyPath() (string, error) {
	dir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "netraxCA.key"), nil
}

func LoadSettings() Settings {
	settingsPath, err := GetSettingsPath()
	if err != nil {
		log.Printf("Could not get settings path: %v", err)
		return defaultSettings
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		// If file doesn't exist, return default
		return defaultSettings
	}

	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		log.Printf("Could not parse settings: %v", err)
		return defaultSettings
	}

	resolved, err := ports.ResolveBindings(s.ProxyBindings, s.ProxyAddr, s.ProxyPort)
	if err != nil {
		log.Printf("Could not parse proxy bindings: %v", err)
		return defaultSettings
	}

	first := ports.FirstBinding(resolved)
	s.ProxyBindings = resolved
	s.ProxyAddr = first.Address
	s.ProxyPort = first.Port

	return s
}

func SaveSettings(s Settings) error {
	settingsPath, err := GetSettingsPath()
	if err != nil {
		return err
	}

	resolved, err := ports.ResolveBindings(s.ProxyBindings, s.ProxyAddr, s.ProxyPort)
	if err != nil {
		return err
	}
	first := ports.FirstBinding(resolved)
	s.ProxyBindings = resolved
	s.ProxyAddr = first.Address
	s.ProxyPort = first.Port

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, data, 0644)
}

func GenerateCA() error {
	certPath, err := GetCertPath()
	if err != nil {
		return err
	}
	keyPath, err := GetKeyPath()
	if err != nil {
		return err
	}

	// Generate private key
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate private key: %w", err)
	}

	// Create certificate template
	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}
	pkixName := pkix.Name{
		CommonName:         "NetraX CA",
		Organization:       []string{"NetraX"},
		OrganizationalUnit: []string{"NetraX CA"},
		Country:            []string{"India"},
	}
	template := x509.Certificate{
		SerialNumber:          serialNumber,
		Subject:               pkixName,
		Issuer:                pkixName,
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(10, 0, 0), // 10 years validity
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	// Create certificate
	certDer, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	// Save private key
	keyOut, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to open key.pem for writing: %w", err)
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)}); err != nil {
		return fmt.Errorf("failed to write data to key.pem: %w", err)
	}
	if err := keyOut.Close(); err != nil {
		return fmt.Errorf("error closing key.pem: %w", err)
	}

	// Save cert
	certOut, err := os.Create(certPath)
	if err != nil {
		return fmt.Errorf("failed to open cert.pem for writing: %w", err)
	}
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDer}); err != nil {
		return fmt.Errorf("failed to write data to cert.pem: %w", err)
	}
	if err := certOut.Close(); err != nil {
		return fmt.Errorf("error closing cert.pem: %w", err)
	}

	return nil
}

func EnsureCA() error {
	certPath, err := GetCertPath()
	if err != nil {
		return err
	}
	keyPath, err := GetKeyPath()
	if err != nil {
		return err
	}

	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		log.Println("CA Certificate not found, generating a new one...")
		return GenerateCA()
	}

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		log.Println("CA Key not found, generating a new one...")
		return GenerateCA()
	}

	return nil
}
