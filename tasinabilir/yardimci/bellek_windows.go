//go:build windows

package main

import (
	"unsafe"
)

// toplamBellek: bilgisayarın fiziksel belleği, bayt (10.11 — okuma kipi önerisi). GlobalMemoryStatusEx. Bilinmiyorsa 0.
var globalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")

type bellekDurumu struct {
	uzunluk, yuk                                        uint32
	toplamFiziksel, bosFiziksel                         uint64
	toplamSayfa, bosSayfa, toplamSanal, bosSanal, ekBos uint64
}

func toplamBellek() uint64 {
	var d bellekDurumu
	d.uzunluk = uint32(unsafe.Sizeof(d))
	if r, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&d))); r == 0 {
		return 0
	}
	return d.toplamFiziksel
}
