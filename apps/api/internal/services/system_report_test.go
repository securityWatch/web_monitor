package services_test

import (
	"testing"

	"github.com/pulsewatch/api/internal/services"
	"github.com/stretchr/testify/assert"
)

func TestReportDays(t *testing.T) {
	assert.Equal(t, 1, services.ReportDays("daily"))
	assert.Equal(t, 7, services.ReportDays("weekly"))
	assert.Equal(t, 30, services.ReportDays("monthly"))
	assert.Equal(t, 7, services.ReportDays(""))
}
