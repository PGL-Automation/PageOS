package msgraph

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
)

// ParseTokenKey decodes a 64-char hex string into a 32-byte AES-256 key.
func ParseTokenKey(hexKey string) ([]byte, error) {
	b, err := hex.DecodeString(hexKey)
	if err != nil || len(b) != 32 {
		return nil, fmt.Errorf("PAGEOS_MSGRAPH_TOKEN_KEY must be a 64-char hex string (32 bytes); generate with: openssl rand -hex 32")
	}
	return b, nil
}

// encrypt encrypts plaintext with AES-256-GCM.
// Output layout: [12-byte nonce][GCM ciphertext+tag].
func encrypt(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// decrypt reverses encrypt.
func decrypt(key, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	if len(ciphertext) < ns {
		return nil, fmt.Errorf("ciphertext too short")
	}
	return gcm.Open(nil, ciphertext[:ns], ciphertext[ns:], nil)
}
