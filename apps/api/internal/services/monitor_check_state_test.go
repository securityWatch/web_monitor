package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMonitorConsecutiveFailuresThreshold(t *testing.T) {
	assert.Equal(t, 1, MonitorConsecutiveFailuresThreshold(nil))
	assert.Equal(t, 3, MonitorConsecutiveFailuresThreshold([]byte(`{"alerts":{"consecutiveFailuresBeforeAlert":3}}`)))
	assert.Equal(t, 1, MonitorConsecutiveFailuresThreshold([]byte(`{"alerts":{"consecutiveFailuresBeforeAlert":0}}`)))
	assert.Equal(t, 10, MonitorConsecutiveFailuresThreshold([]byte(`{"alerts":{"consecutiveFailuresBeforeAlert":99}}`)))
}

func TestComputeMonitorCheckState(t *testing.T) {
	up := ComputeMonitorCheckState(true, 2, 3)
	assert.Equal(t, "up", up.Status)
	assert.Equal(t, 0, up.ConsecutiveFailures)
	assert.True(t, up.ClearPendingDownAt)

	first := ComputeMonitorCheckState(false, 0, 3)
	assert.Equal(t, "pending", first.Status)
	assert.Equal(t, 1, first.ConsecutiveFailures)

	third := ComputeMonitorCheckState(false, 2, 3)
	assert.Equal(t, "down", third.Status)
	assert.Equal(t, 3, third.ConsecutiveFailures)
	assert.True(t, third.SetPendingDownAt)

	stillDown := ComputeMonitorCheckState(false, 3, 3)
	assert.Equal(t, "down", stillDown.Status)
	assert.False(t, stillDown.SetPendingDownAt)

	immediate := ComputeMonitorCheckState(false, 0, 1)
	assert.Equal(t, "down", immediate.Status)
	assert.True(t, immediate.SetPendingDownAt)
}
