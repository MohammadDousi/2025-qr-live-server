# QR Live Server

Scan a QR Code to open your live server up in your mobile browser.

## Features

- 🔍 Smart Port Detection
  - Automatic detection of running development servers
  - Terminal-based port detection
  - Process-based port scanning
- 🌐 Network Features
  - Generates QR code for local IP address and port
  - IPv4 support
  - Automatic network interface detection
- ⌨️ User Interface
  - Quick port selection from detected servers
  - Manual port input support
  - Status bar integration
- 📱 Mobile Integration
  - Easy to scan QR codes
  - Optimized for mobile browsers
  - Instant connection to local servers

## Installation

1. Open VS Code
2. Go to Extensions (Cmd+Shift+X)
3. Search for "QR Live Server"
4. Click Install

## Usage

1. Start your development server
2. Click the QR Code icon in the status bar (or use command palette)
3. Select from detected ports or enter manually
4. Scan the QR code with your mobile device

## Known Issues

- Port detection reliability varies by OS
- Only IPv4 addresses currently supported
- Some antivirus software may block port scanning

## Release Notes

### 0.0.49
- Improved port detection algorithm
- Added support for more development frameworks
- Enhanced error messages and user feedback
- Fixed port scanning issues on different operating systems
- Optimized QR code generation performance
- Added automatic port refresh

### 0.0.46
- Enhanced port detection reliability
- Added process-based port scanning
- Improved error handling
- Better framework detection

### 0.0.45
- Added automatic framework detection
- Terminal-based port detection
- Improved UI/UX

### 0.0.43
- Initial QR code generation
- Basic port detection
- Status bar integration

## Troubleshooting

1. **No Ports Detected**
   - Ensure your server is running
   - Try manually entering the port
   - Check terminal for server messages

2. **QR Code Not Scanning**
   - Ensure good lighting
   - Clean camera lens
   - Try adjusting distance

3. **Connection Issues**
   - Verify devices are on same network
   - Check firewall settings
   - Confirm port is accessible

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Support

Found a bug or have a feature request? [Open an issue](https://github.com/MohammadDousi/ipQrGenerator/issues)

---

**Enjoy!** 🚀
