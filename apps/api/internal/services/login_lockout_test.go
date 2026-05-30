package services_test

import (
	"testing"
	"time"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
)

func TestAccountLockedError(t *testing.T) {
	err := &services.AccountLockedError{RetryAfter: 15 * time.Minute}
	assert.Equal(t, services.ErrAccountLocked.Error(), err.Error())
}
