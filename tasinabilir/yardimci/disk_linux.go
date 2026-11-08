//go:build linux

package main

import (
	"os/exec"
	"syscall"
)

type diskBilgi struct {
	bos, toplam  uint64
	dosyaSistemi string
	buyukDosya   bool
}

func diskDurumu(yol string) (diskBilgi, error) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(yol, &s); err != nil {
		return diskBilgi{}, err
	}
	fs, buyuk := "linux", true
	if s.Type == 0x4d44 { // MSDOS_SUPER_MAGIC: FAT
		fs, buyuk = "FAT32", false
	}
	return diskBilgi{bos: s.Bavail * uint64(s.Bsize), toplam: s.Blocks * uint64(s.Bsize), dosyaSistemi: fs, buyukDosya: buyuk}, nil
}

func gizle(cmd *exec.Cmd) {}
