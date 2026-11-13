//go:build linux

package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// toplamBellek: bilgisayarın fiziksel belleği, bayt (10.11 — okuma kipi önerisi). /proc/meminfo "MemTotal: N kB". Bilinmiyorsa 0.
func toplamBellek() uint64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		alan := strings.Fields(s.Text())
		if len(alan) >= 2 && alan[0] == "MemTotal:" {
			if n, err := strconv.ParseUint(alan[1], 10, 64); err == nil {
				return n * 1024
			}
		}
	}
	return 0
}
