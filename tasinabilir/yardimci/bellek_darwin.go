//go:build darwin

package main

import (
	"os/exec"
	"strconv"
	"strings"
)

// toplamBellek: bilgisayarın fiziksel belleği, bayt (10.11 — okuma kipi önerisi). Bilinmiyorsa 0.
// syscall.Sysctl ikili sayının sondaki sıfır baytlarını kırptığı için hw.memsize'ı sysctl komutundan okuyoruz.
func toplamBellek() uint64 {
	c, err := exec.Command("/usr/sbin/sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return 0
	}
	n, err := strconv.ParseUint(strings.TrimSpace(string(c)), 10, 64)
	if err != nil {
		return 0
	}
	return n
}
