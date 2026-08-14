# DSH Desktop Community

An **unofficial community desktop wrapper** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It packages the official Web UI inside a native Windows window and starts the local Harness service automatically.

> This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related trademarks belong to their respective owners.

## Windows features

- Native desktop window instead of a browser tab
- Bundled Electron/Node runtime; end users do not need to install Node.js
- Windows x64 installer with desktop and Start Menu shortcuts
- Native folder picker for changing the Harness working directory
- First-run working-directory selection
- Persistent startup log and actionable error dialog
- Build-time execution checks for both installed and packaged DSH dependencies
- Local-only service bound to `127.0.0.1`
- Original DeepSeek Harness Web UI

## Development

Requirements: Node.js 22 or newer and Windows 10/11 x64.

```powershell
npm install
npm start
```

Build the installer:

```powershell
npm run dist:win
```

The installer is written to `dist/`.

## Release status

The first community release is unsigned. Windows SmartScreen may show an “Unknown publisher” warning. A future release can be signed once the project has a trusted code-signing certificate.

## License

Desktop-wrapper additions are released under the MIT License. DeepSeek Harness remains governed by its upstream MIT license and third-party notices.
