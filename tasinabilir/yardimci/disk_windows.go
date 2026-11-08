//go:build windows

package main

import (
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

type diskBilgi struct {
	bos, toplam  uint64
	dosyaSistemi string
	buyukDosya   bool
}

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpace = kernel32.NewProc("GetDiskFreeSpaceExW")
	getVolumeInfo    = kernel32.NewProc("GetVolumeInformationW")
)

func diskDurumu(yol string) (diskBilgi, error) {
	kokYol := filepath.VolumeName(yol) + `\`
	p, err := syscall.UTF16PtrFromString(kokYol)
	if err != nil {
		return diskBilgi{}, err
	}
	var bos, toplam, toplamBos uint64
	r, _, e := getDiskFreeSpace.Call(uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&bos)),
		uintptr(unsafe.Pointer(&toplam)), uintptr(unsafe.Pointer(&toplamBos)))
	if r == 0 {
		return diskBilgi{}, e
	}
	ad := make([]uint16, 64)
	r, _, _ = getVolumeInfo.Call(uintptr(unsafe.Pointer(p)), 0, 0, 0, 0, 0,
		uintptr(unsafe.Pointer(&ad[0])), uintptr(len(ad)))
	fs := ""
	if r != 0 {
		fs = syscall.UTF16ToString(ad)
	}
	return diskBilgi{bos: bos, toplam: toplam, dosyaSistemi: fs,
		buyukDosya: !strings.HasPrefix(strings.ToUpper(fs), "FAT")}, nil
}

// gizle: kiwix-manage çalışırken siyah pencere açılmasın
func gizle(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
