package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestParseCheckResultsPartitionMonth(t *testing.T) {
	tm, ok := parseCheckResultsPartitionMonth("check_results_2024_03")
	assert.True(t, ok)
	assert.Equal(t, time.March, tm.Month())
	assert.Equal(t, 2024, tm.Year())

	_, ok = parseCheckResultsPartitionMonth("check_results_default")
	assert.False(t, ok)
}
