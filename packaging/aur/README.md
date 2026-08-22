# MeshDrop Arch Linux (AUR) Package

This directory contains the official **PKGBUILD** recipe for the Arch User Repository (`AUR`) package: **`meshdrop-bin`**.

---

## 📦 For Arch / Manjaro Users

Users can install MeshDrop with any AUR helper:

```bash
# Using yay
yay -S meshdrop-bin

# Using paru
paru -S meshdrop-bin
```

---

## 🤖 Continuous Delivery & Automation

Whenever a new release tag (e.g. `v1.0.37`) is pushed, the GitHub Actions release workflow:
1. Builds the official Linux AppImage binary.
2. Runs `scripts/update-aur.js` to automatically calculate the AppImage's SHA256 checksum and update `pkgver`.
3. Pushes the updated `PKGBUILD` and `.SRCINFO` to `ssh://aur@aur.archlinux.org/meshdrop-bin.git`.

### Required One-Time GitHub Secret:
* **`AUR_SSH_PRIVATE_KEY`**: An Ed25519 or RSA SSH private key associated with your `aur.archlinux.org` account.
* **`AUR_USERNAME`** (optional, defaults to `aamirali51`): Your AUR account username.
* **`AUR_EMAIL`** (optional): Your AUR account email address.
