"use client";
import React, { useEffect, useState } from "react";

interface TourOverlayProps {
  active: boolean;
  step: number;
  targetId: string | null;
  title: string;
  description: string;
  totalSteps: number;
  onNext: () => void;
  onClose: () => void;
  position?: "left" | "right" | "top" | "bottom" | "center";
  buttonText?: string;
  isActionRequired?: boolean; // If true, the user must click the highlighted element to proceed
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  active,
  step,
  targetId,
  title,
  description,
  totalSteps,
  onNext,
  onClose,
  position = "right",
  buttonText = "Next Step",
  isActionRequired = false,
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !targetId) {
      setTimeout(() => setRect(null), 0);
      return;
    }

    const updateRect = () => {
      const el = document.getElementById(targetId);
      if (el) {
        setRect(el.getBoundingClientRect());
      }
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    // Use capture phase for scrolling
    window.addEventListener("scroll", updateRect, true);

    // Periodically update to catch layout shifts
    const interval = setInterval(updateRect, 300);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      clearInterval(interval);
    };
  }, [active, targetId, step]);

  useEffect(() => {
    // Inject pulse animation globally
    if (!document.getElementById("tour-pulse-style")) {
      const style = document.createElement("style");
      style.id = "tour-pulse-style";
      style.innerHTML = `
        @keyframes tourPulse {
          0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(14, 165, 233, 0); }
          100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0); }
        }
        .tour-highlight {
          animation: tourPulse 2s infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (!active) return null;

  const getTooltipPosition = () => {
    if (!rect || position === "center")
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const margin = 20;

    let top = rect.top;
    let left = rect.right + margin;
    let transform = "none";

    if (position === "right") {
      // Horizontal check
      if (left + 320 > window.innerWidth) {
        // Try flip to left side
        const leftSide = rect.left - 320 - margin;
        if (leftSide > 0) {
          left = leftSide;
        } else {
          // Screen too small, center it
          left = window.innerWidth / 2;
          transform = "translateX(-50%)";
          top = rect.bottom + margin; // Push below
        }
      }

      // Vertical overflow check
      if (top + 250 > window.innerHeight) {
        return { bottom: margin, left: typeof left === 'number' ? left + 'px' : left, transform };
      }

      return { top, left: typeof left === 'number' ? left + 'px' : left, transform };
    }
    
    if (position === "bottom") {
      top = rect.bottom + margin;
      left = rect.left;
      if (left + 320 > window.innerWidth) {
         left = window.innerWidth - 320 - margin;
      }
      if (top + 250 > window.innerHeight) {
         return { bottom: window.innerHeight - rect.top + margin, left: Math.max(margin, left) };
      }
      return { top, left: Math.max(margin, left) };
    }
    if (position === "top") {
      return {
        bottom: window.innerHeight - rect.top + margin,
        left: rect.left,
      };
    }
    if (position === "left") {
      return { top: rect.top, right: window.innerWidth - rect.left + margin };
    }
    return { top: rect.top, left: rect.right + margin };
  };

  // Provide a huge clipPath fallback if no rect is found, so user sees full screen dark
  const polygon = rect
    ? `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${rect.left - 6}px ${rect.top - 6}px, ${rect.right + 6}px ${rect.top - 6}px, ${rect.right + 6}px ${rect.bottom + 6}px, ${rect.left - 6}px ${rect.bottom + 6}px, ${rect.left - 6}px ${rect.top - 6}px)`
    : "none";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000, // Highest possible
        pointerEvents: "none",
      }}
    >
      {/* Background Mask */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: rect ? "blur(3px)" : "blur(8px)",
          clipPath: polygon,
          transition:
            "clip-path 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s ease",
          pointerEvents: "auto",
        }}
        onClick={onClose}
      />

      {/* Pulsing ring around target */}
      {rect && (
        <div
          className="tour-highlight"
          style={{
            position: "absolute",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: "8px",
            border: "2px solid #38BDF8",
            pointerEvents: "none", // Let clicks pass through to the real element below!
            transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      )}

      {/* Floating Card */}
      <div
        style={{
          position: "absolute",
          ...getTooltipPosition(),
          background: "linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
          backdropFilter: "blur(16px)",
          borderRadius: "16px",
          width: "340px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)",
          padding: "24px",
          pointerEvents: "auto",
          transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#F8FAFC",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#38BDF8",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "rgba(56, 189, 248, 0.1)",
              padding: "4px 8px",
              borderRadius: "12px",
              border: "1px solid rgba(56, 189, 248, 0.2)",
            }}
          >
            STEP {step} OF {totalSteps}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748B",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              transition: "color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#CBD5E1")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#64748B")}
          >
            Skip Tour
          </button>
        </div>
        <h3
          style={{
            margin: "0 0 10px 0",
            fontSize: "18px",
            fontWeight: 700,
            color: "#F8FAFC",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            color: "#94A3B8",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onNext}
            style={{
              flex: 1,
              background: isActionRequired ? "rgba(255, 255, 255, 0.05)" : "linear-gradient(to right, #0EA5E9, #3B82F6)",
              color: isActionRequired ? "#64748B" : "#FFFFFF",
              border: isActionRequired ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
              boxShadow: isActionRequired ? "none" : "0 4px 14px 0 rgba(14, 165, 233, 0.39)",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isActionRequired ? "default" : "pointer",
              transition: "all 0.2s ease",
            }}
            disabled={isActionRequired}
          >
            {isActionRequired ? "Click highlighted area..." : buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};
