import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { GLTFLoader } from "three-stdlib";
import { FBXLoader } from "three-stdlib";
import { OBJLoader } from "three-stdlib";

const FloatingBoxes = () => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const animationRef = useRef(null);
  const videoRef = useRef(null);
  const [handPosition, setHandPosition] = useState(null);
  const [modelUrl, setModelUrl] = useState(null);
  const [customModel, setCustomModel] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;

    /* ================= SCENE ================= */
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 8, 25);

    const camera = new THREE.PerspectiveCamera(
      90,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    /* ================= LIGHT ================= */
    scene.add(new THREE.AmbientLight(0x6080ff, 0.35));

    const light1 = new THREE.PointLight(0x00ffff, 2, 30);
    light1.position.set(5, 5, 10);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff00ff, 1.5, 30);
    light2.position.set(-5, -3, 8);
    scene.add(light2);

    /* ================= BOX GRID ================= */
    const group = new THREE.Group();
    scene.add(group);

    const gridX = 20;
    const gridY = 14;
    const spacing = 2.6;

    const geometry = new THREE.BoxGeometry(1.5, 1.5, 0.5, 4, 4, 2);
    const colors = [0x00ffff, 0xff00ff, 0x00ff88, 0xffaa00, 0x8855ff];
    const cubes = [];

    // Function to create object (custom model or box)
    const createObject = (color) => {
      if (customModel) {
        // Clone custom model
        const obj = customModel.clone();
        
        // Scale model to fit grid
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.2 / maxDim;
        obj.scale.set(scale, scale, scale);
        
        // Apply color to all meshes in model
        obj.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 0.15,
              roughness: 0.25,
              metalness: 0.8,
              transparent: true,
              opacity: 0.9
            });
          }
        });
        
        return obj;
      } else {
        // Default box
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.15,
          roughness: 0.25,
          metalness: 0.8,
          transparent: true,
          opacity: 0.9
        });
        return new THREE.Mesh(geometry, material);
      }
    };

    for (let y = 0; y < gridY; y++) {
      for (let x = 0; x < gridX; x++) {
        const color = colors[(x + y) % colors.length];
        const cube = createObject(color);

        const baseX = (x - gridX / 2 + 0.5) * spacing;
        const baseY = (y - gridY / 2 + 0.5) * spacing;

        cube.position.set(baseX, baseY, 0);

        cube.userData = {
          baseX,
          baseY,
          baseZ: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          floatOffset: Math.random() * Math.PI * 2,
          floatSpeed: 0.5 + Math.random() * 0.5,
          floatAmp: 0.2 + Math.random() * 0.15
        };

        group.add(cube);
        cubes.push(cube);
      }
    }

    /* ================= HAND TRACKING (WEBCAM) ================= */
    const mouse3D = new THREE.Vector3(-999, -999, 0);
    const mouse = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    const updateHandPosition = (x, y) => {
      // x, y are normalized coordinates from MediaPipe (0-1)
      mouse.x = x * 2 - 1;
      mouse.y = -(y * 2 - 1);
      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(plane, mouse3D);
      
      // Update state for visual indicator
      setHandPosition({ x: x * window.innerWidth, y: y * window.innerHeight });
    };

    // Setup MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Get index finger tip (landmark 8)
        const indexTip = results.multiHandLandmarks[0][8];
        updateHandPosition(indexTip.x, indexTip.y);
      } else {
        // No hand detected, move cursor away
        mouse3D.set(-999, -999, 0);
        setHandPosition(null);
      }
    });

    // Setup webcam
    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          await hands.send({ image: videoRef.current });
        },
        width: 640,
        height: 480
      });
      camera.start();
    }

    /* ================= PHYSICS ================= */
    const pushRadius = 3.2;
    const pushStrength = 0.4; // Reduced for gentler push
    const springStrength = 0.025;
    const damping = 0.93;
    const gravity = 0.012;
    const maxSpeed = 0.4;
    const collisionRadius = 1.6; // Distance to detect collision between boxes

    let time = 0;

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      time += 0.016;

      cubes.forEach(cube => {
        const d = cube.userData;

        // FLOATING ANIMATION - calculate target position
        const floatY = Math.sin(time * d.floatSpeed + d.floatOffset) * d.floatAmp;
        const floatX = Math.cos(time * d.floatSpeed * 0.7 + d.floatOffset) * d.floatAmp * 0.5;
        
        const targetX = d.baseX + floatX;
        const targetY = d.baseY + floatY;
        const targetZ = d.baseZ;

        // GRAVITY EFFECT - pull boxes down
        d.vy -= gravity;

        // PUSH EFFECT - repel from mouse (ONLY SIDEWAYS, NO Z)
        const dx = cube.position.x - mouse3D.x;
        const dy = cube.position.y - mouse3D.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Helper function to set emissive intensity (works for both Mesh and Group)
        const setEmissiveIntensity = (obj, intensity) => {
          if (obj.material && obj.material.emissive !== undefined) {
            obj.material.emissiveIntensity = intensity;
          } else {
            obj.traverse((child) => {
              if (child.isMesh && child.material && child.material.emissive !== undefined) {
                child.material.emissiveIntensity = intensity;
              }
            });
          }
        };

        if (dist < pushRadius && dist > 0.01) {
          const force = (1 - dist / pushRadius) * pushStrength;
          d.vx += (dx / dist) * force;
          d.vy += (dy / dist) * force;
          // NO Z-AXIS PUSH - removed d.vz
          
          // Glow effect when pushed
          setEmissiveIntensity(cube, 0.4 + force * 0.6);
        } else {
          // Fade back to normal
          const currentIntensity = cube.material?.emissiveIntensity || 0.15;
          const targetIntensity = 0.15;
          const newIntensity = currentIntensity + (targetIntensity - currentIntensity) * 0.1;
          setEmissiveIntensity(cube, newIntensity);
        }

        // COLLISION DETECTION - prevent boxes from passing through each other
        cubes.forEach(otherCube => {
          if (cube === otherCube) return;
          
          const dx2 = cube.position.x - otherCube.position.x;
          const dy2 = cube.position.y - otherCube.position.y;
          const dz2 = cube.position.z - otherCube.position.z;
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);
          
          if (dist2 < collisionRadius && dist2 > 0.01) {
            // Push boxes apart gently
            const overlap = collisionRadius - dist2;
            const force = overlap * 0.015; // Gentle repulsion
            
            d.vx += (dx2 / dist2) * force;
            d.vy += (dy2 / dist2) * force;
            d.vz += (dz2 / dist2) * force * 0.3; // Less Z movement
          }
        });

        // SPRING BACK to target position (slowly)
        d.vx += (targetX - cube.position.x) * springStrength;
        d.vy += (targetY - cube.position.y) * springStrength;
        d.vz += (targetZ - cube.position.z) * springStrength;

        // DAMPING
        d.vx *= damping;
        d.vy *= damping;
        d.vz *= damping;

        // CLAMP SPEED
        d.vx = THREE.MathUtils.clamp(d.vx, -maxSpeed, maxSpeed);
        d.vy = THREE.MathUtils.clamp(d.vy, -maxSpeed, maxSpeed);

        // UPDATE POSITION
        cube.position.x += d.vx;
        cube.position.y += d.vy;
        cube.position.z += d.vz;

        // ROTATION based on velocity
        cube.rotation.x = d.vy * 0.5;
        cube.rotation.y = -d.vx * 0.5;
      });

      renderer.render(scene, camera);
    };

    animate();

    /* ================= RESIZE HANDLER ================= */
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    /* ================= CLEANUP (FIXED) ================= */
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      // Cleanup MediaPipe Hands
      if (hands) {
        hands.close();
      }

      cubes.forEach(c => {
        // Dispose geometry and material for both Mesh and Group
        if (c.geometry) {
          c.geometry.dispose();
        }
        if (c.material) {
          c.material.dispose();
        }
        // For custom models (Groups), traverse and dispose all children
        c.traverse((child) => {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });

      if (rendererRef.current) {
        rendererRef.current.dispose();

        if (
          containerRef.current &&
          rendererRef.current.domElement.parentNode ===
            containerRef.current
        ) {
          containerRef.current.removeChild(
            rendererRef.current.domElement
          );
        }
      }
    };
  }, [customModel]);

  // Handle file upload for custom 3D models
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setModelUrl(url);
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    // Choose appropriate loader based on file extension
    let loader;
    if (extension === 'gltf' || extension === 'glb') {
      loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        setCustomModel(gltf.scene);
      }, undefined, (error) => {
        console.error('Error loading GLTF/GLB:', error);
        alert('Error loading model. Please check the file format.');
      });
    } else if (extension === 'fbx') {
      loader = new FBXLoader();
      loader.load(url, (fbx) => {
        setCustomModel(fbx);
      }, undefined, (error) => {
        console.error('Error loading FBX:', error);
        alert('Error loading model. Please check the file format.');
      });
    } else if (extension === 'obj') {
      loader = new OBJLoader();
      loader.load(url, (obj) => {
        setCustomModel(obj);
      }, undefined, (error) => {
        console.error('Error loading OBJ:', error);
        alert('Error loading model. Please check the file format.');
      });
    } else {
      alert('Unsupported file format. Please use GLB, GLTF, FBX, or OBJ files.');
    }
  };

  const resetToDefault = () => {
    setCustomModel(null);
    setModelUrl(null);
  };

  return (
    <>
      {/* Hidden video for webcam */}
      <video
        ref={videoRef}
        style={{ display: "none" }}
        autoPlay
        playsInline
      />

      {/* 3D Canvas */}
      <div
        ref={containerRef}
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "#ffffff"
        }}
      />

      {/* Hand Position Indicator - Small Transparent Circle */}
      {handPosition && (
        <div
          style={{
            position: "fixed",
            left: handPosition.x - 25,
            top: handPosition.y - 25,
            width: "50px",
            height: "50px",
            borderRadius: "50%",
            border: "2px solid rgba(0, 255, 255, 0.6)",
            backgroundColor: "rgba(0, 255, 255, 0.1)",
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "0 0 20px rgba(0, 255, 255, 0.4)",
            transition: "all 0.05s ease-out"
          }}
        />
      )}

      {/* Model Upload Controls */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          zIndex: 2000,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "rgba(10, 10, 26, 0.8)",
          padding: "15px",
          borderRadius: "10px",
          border: "1px solid rgba(0, 255, 255, 0.3)",
          backdropFilter: "blur(10px)"
        }}
      >
        <label
          style={{
            color: "#00ffff",
            fontSize: "14px",
            fontWeight: "bold",
            marginBottom: "5px"
          }}
        >
          Custom 3D Model
        </label>
        
        <input
          type="file"
          accept=".glb,.gltf,.fbx,.obj"
          onChange={handleFileUpload}
          style={{
            color: "#00ffff",
            fontSize: "12px",
            cursor: "pointer"
          }}
        />
        
        {customModel && (
          <button
            onClick={resetToDefault}
            style={{
              padding: "8px 15px",
              background: "rgba(255, 0, 255, 0.2)",
              border: "1px solid rgba(255, 0, 255, 0.6)",
              borderRadius: "5px",
              color: "#ff00ff",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255, 0, 255, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255, 0, 255, 0.2)";
            }}
          >
            Reset to Default Boxes
          </button>
        )}
        
        <div
          style={{
            color: "rgba(0, 255, 255, 0.6)",
            fontSize: "11px",
            marginTop: "5px"
          }}
        >
          Supported: GLB, GLTF, FBX, OBJ
        </div>
      </div>
    </>
  );
};

export default FloatingBoxes;