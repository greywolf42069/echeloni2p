import React, { useRef, useEffect } from 'react';

const XMBWaveBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frameId: number;
        let step = 0;

        const waves = [
            { y: 0.5, amplitude: 50, length: 0.02, speed: 0.05, color: 'rgba(167, 139, 250, 0.4)', lineWidth: 2 }, // purple
            { y: 0.55, amplitude: 60, length: 0.015, speed: 0.06, color: 'rgba(45, 212, 191, 0.4)', lineWidth: 2.5 }, // teal
            { y: 0.45, amplitude: 70, length: 0.025, speed: -0.04, color: 'rgba(99, 102, 241, 0.3)', lineWidth: 1.5 }, // indigo
        ];
        
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            waves.forEach(wave => wave.y = canvas.height / 2);
        };

        const animate = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            step++;

            waves.forEach(wave => {
                ctx.beginPath();
                ctx.moveTo(0, wave.y);
                ctx.strokeStyle = wave.color;
                ctx.lineWidth = wave.lineWidth;
                ctx.shadowColor = wave.color;
                ctx.shadowBlur = 10;
                
                // We use two sine waves multiplied to make the amplitude fade at the edges
                for (let i = 0; i <= canvas.width; i += 5) {
                    const y = wave.y + Math.sin(i * wave.length + step * wave.speed) * wave.amplitude * Math.sin(Math.PI * i / canvas.width);
                    ctx.lineTo(i, y);
                }
                ctx.stroke();
            });

            frameId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(frameId);
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 -z-10" />;
};

export default XMBWaveBackground;
