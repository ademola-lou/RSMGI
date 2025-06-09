# RSMGI - Reflective Shadow Maps Global Illumination

A real-time global illumination demo implemented in Three.js using **Reflective Shadow Maps (RSM)** technique.

## 🌟 Features

- **Real-time Global Illumination** using RSM technique
- **Multiple lighting modes**: Spot light and Directional light
- **Debug visualization modes** for G-Buffer components

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The application will be available at `http://localhost:3900`

## 🛠️ Technical Details

### RSM Implementation
- **G-Buffer rendering** for geometry data
- **RSM generation** from light's perspective
- **Indirect lighting calculation** using importance sampling
- **Bilateral filtering** for noise reduction

### Debug Modes
- Albedo, Normal, Depth visualization
- RSM components (Normal, Position, Flux)
- Indirect lighting contribution
- Final composited result

## 📋 To-Do List
- [ ] add RSM manager for multiple lights
- [ ] use a effect composer
- [ ] port to react-three/fiber
- [ ] extend RSM GI to LPV GI

## 📦 Built With
- **Three.js** - 3D graphics library
- **Vite** - Build tool and development server
- **TypeScript** - Type safety and better development experience

## 📚 References

This implementation is based on research and techniques from:

- [CS 248 Final Project Report - RSM Global Illumination](https://cdn.prod.website-files.com/5ecf46ad35aad56948985cf5/6260c0b5f2e1cd7f67eda161_CS_248_Final_Project_Report_compressed.pdf) - Academic research on Reflective Shadow Maps implementation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

*This project demonstrates advanced real-time rendering techniques for educational and research purposes.*
