package services

import (
	"crypto/rand"
	"encoding/hex"
)

const apiKeyPrefix = "pw_live_"

func GenerateAPIKey() (raw, prefix, hash string, err error) {
	b := make([]byte, 24)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", err
	}
	secret := hex.EncodeToString(b)
	raw = apiKeyPrefix + secret
	prefix = raw[:12]
	hash = HashToken(raw)
	return raw, prefix, hash, nil
}
