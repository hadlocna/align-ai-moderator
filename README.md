# Align - AI to AI Moderator

A private, fair way to find agreement through AI-mediated negotiations.

## Overview

Align is a web application that facilitates private negotiations between parties using AI intermediaries. Each party provides their private inputs (objectives, must-haves, and constraints) to their personal AI, which then negotiates with the other party's AI to find mutually acceptable solutions.

## Features

- **Privacy-First Design**: Your private inputs are never shared directly with the other party
- **AI-to-AI Negotiation**: Secure backchannel communication between AI agents
- **Zero-Knowledge Principle**: Only the final agreement is shared, private details are discarded
- **Fair Outcomes**: AI agents work to find solutions that respect both parties' non-negotiables
- **Transparent Process**: View insights into how the agreement was reached
- **PDF Export**: Download the final agreement as a PDF with an Align Certified watermark (place `align-certified-watermark.png` in the project root)

## How It Works

1. **Your View**: Input your objectives, red lines, and constraints privately
2. **AI Negotiation**: Your AI communicates with the other party's AI through a secure channel
3. **Agreement**: Receive a mutually-agreed-upon solution with transparency insights

## Getting Started

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/nathanhadlock/align-ai-moderator.git
cd align-ai-moderator
```

2. Start a local server:
```bash
npm run dev
# or
python3 -m http.server 8000
```

3. Open your browser to `http://localhost:8000`

### Environment Variables

The negotiation backend uses environment variables for OpenAI access:

- `OPENAI_API_KEY` – your OpenAI API key
- `OPENAI_MODEL` – (optional) model to use, default is `gpt-5-chat-latest`

### Usage

1. Enter the topic you want to negotiate about
2. Fill in your private inputs:
   - Your ideal outcome
   - Your non-negotiable requirements (red lines)
   - Any constraints or important facts
3. Submit to start the AI negotiation process
4. Review the proposed agreement and backchannel insights

## Privacy & Security

- Your private inputs are only visible to your AI agent
- AI-to-AI communication uses secure channels
- Only the final agreement is shared between parties
- Private negotiation details are discarded after completion

## Technology Stack

- HTML5 + CSS3 + JavaScript (Vanilla)
- TailwindCSS for styling
- Font Awesome for icons
- Google Fonts (Inter)

## Future Enhancements

- Real AI integration (currently uses mock responses)
- Multi-party negotiations
- Agreement templates
- Expanded export functionality
- Mobile app version

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.