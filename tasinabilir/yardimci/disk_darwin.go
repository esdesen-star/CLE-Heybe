//go:build darwin

package main

import (
	"os/exec"
	"strings"
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
	var ad []byte
	for _, c := range s.Fstypename {
		if c == 0 {
			break
		}
		ad = append(ad, byte(c))
	}
	fs := strings.ToLower(string(ad))
	return diskBilgi{bos: s.Bavail * uint64(s.Bsize), toplam: s.Blocks * uint64(s.Bsize),
		dosyaSistemi: sistemAdi(fs), buyukDosya: fs != "msdos"}, nil
}

// sistemAdi: Mac'in iç adını kullanıcının tanıdığı ada çevirir (06.11: sayfada "MSDOS" görünüyordu).
func sistemAdi(fs string) string {
	switch fs {
	case "msdos":
		return "FAT32"
	case "exfat":
		return "exFAT"
	case "apfs":
		return "APFS"
	case "hfs":
		return "Mac OS (HFS+)"
	}
	return fs
}

func gizle(cmd *exec.Cmd) {}
