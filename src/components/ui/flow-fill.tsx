import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// A living fill: four colours folded into soft swells that drift forward,
// like warm air or slow gas (the phone's `flowFill`, same shader). Time runs
// on and nothing loops, so there are no bands and no seam. Max priority's
// fill and a task being finished wear it. Fills its positioned parent.
// [running] false holds the last frame (stays mounted, no new context).
// A resize redraws at once (a resized canvas is blank until drawn, which
// flickered while the slider's fill grew). Reduced motion: one still
// frame. No WebGL: a plain gradient.

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `precision mediump float;
uniform vec2 size;uniform float time;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;
void main(){
  vec2 xy=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y);
  vec2 p=xy/size.y*0.85;
  p.x-=time*0.6;
  for(int i=1;i<4;i++){float k=float(i);
    p.x+=0.34/k*sin(k*1.9*p.y+0.8*time+0.5*k);
    p.y+=0.30/k*cos(k*1.5*p.x-0.5*time+0.9*k);}
  float f=0.5+0.5*sin(p.x*1.5+p.y*0.8);
  float g=0.5+0.5*sin(p.x*0.8-p.y*1.3+1.7);
  vec3 a=mix(c0,c1,smoothstep(0.,1.,f));
  vec3 b=mix(c2,c3,smoothstep(0.,1.,f));
  vec3 col=mix(a,b,smoothstep(0.15,0.85,g));
  col*=0.93+0.12*g;
  gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function FlowFill({
  colors,
  running = true,
  className,
}: {
  colors: string[];
  running?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The drawing, set up once per colour set; the clock lives outside it so
  // pausing and resuming carries on where it was.
  const drawRef = useRef<((t: number) => void) | null>(null);
  const clock = useRef(0);
  const key = colors.join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      canvas.style.background = `linear-gradient(90deg, ${key})`;
      return;
    }
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const cs = key.split(',');
    ['c0', 'c1', 'c2', 'c3'].forEach((name, i) =>
      gl.uniform3fv(gl.getUniformLocation(prog, name), rgb(cs[Math.min(i, cs.length - 1)])),
    );
    const uSize = gl.getUniformLocation(prog, 'size');
    const uTime = gl.getUniformLocation(prog, 'time');
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    const draw = (t: number) => {
      fit();
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    drawRef.current = draw;
    draw(clock.current);
    // Resizing clears the canvas: draw again before the frame is painted.
    const ro = new ResizeObserver(() => draw(clock.current));
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      drawRef.current = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [key]);

  useEffect(() => {
    if (!running || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      clock.current += (now - last) / 1000;
      last = now;
      drawRef.current?.(clock.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, key]);

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', className)} />;
}
