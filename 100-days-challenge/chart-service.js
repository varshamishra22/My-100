/**
 * Chart Service for 100 Days Challenge
 * Renders weekly activity bar charts with completion percentages.
 * Supports Chart.js and includes a high-DPI native Canvas fallback with tooltips and smooth animations.
 */

export class WeeklyProgressChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.chartData = [];
    this.hoverIndex = -1;
    this.animationProgress = 1;
    this.animId = null;

    if (this.canvas) {
      this.initEvents();
    }
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const count = this.chartData.length || 7;
      const colWidth = width / count;
      const index = Math.floor(x / colWidth);

      if (index >= 0 && index < count && index !== this.hoverIndex) {
        this.hoverIndex = index;
        this.render();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoverIndex !== -1) {
        this.hoverIndex = -1;
        this.render();
      }
    });

    window.addEventListener('resize', () => {
      this.render();
    });
  }

  /**
   * Updates the chart with an array of daily stats:
   * [{ label: 'Mon', date: '2026-09-29', percentage: 80, completed: 4, total: 5 }, ...]
   */
  update(daysData) {
    this.chartData = daysData || [];
    this.animate();
  }

  animate() {
    let start = null;
    const duration = 400;

    if (this.animId) cancelAnimationFrame(this.animId);

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      this.animationProgress = 0.5 - Math.cos(progress * Math.PI) / 2; // easeInOut
      this.render();

      if (progress < 1) {
        this.animId = requestAnimationFrame(step);
      }
    };

    this.animId = requestAnimationFrame(step);
  }

  render() {
    if (!this.canvas || !this.ctx) return;

    // Handle High DPI displays for crisp text and lines
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 16, bottom: 36, left: 16 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const data = this.chartData.length > 0 ? this.chartData : [
      { label: 'Mon', percentage: 0 },
      { label: 'Tue', percentage: 0 },
      { label: 'Wed', percentage: 0 },
      { label: 'Thu', percentage: 0 },
      { label: 'Fri', percentage: 0 },
      { label: 'Sat', percentage: 0 },
      { label: 'Sun', percentage: 0 }
    ];

    const count = data.length;
    const colWidth = chartWidth / count;
    const barWidth = Math.min(Math.max(colWidth * 0.45, 14), 38);

    // Draw Subtle Gridlines (0%, 50%, 100%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    [0, 50, 100].forEach(pct => {
      const y = padding.top + chartHeight - (pct / 100) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    });
    ctx.setLineDash([]); // Reset line dash

    // Draw Bars
    data.forEach((item, i) => {
      const pct = Math.max(0, Math.min(100, item.percentage || 0));
      const targetBarHeight = (pct / 100) * chartHeight;
      const animatedBarHeight = targetBarHeight * this.animationProgress;

      const x = padding.left + i * colWidth + (colWidth - barWidth) / 2;
      const y = padding.top + chartHeight - animatedBarHeight;
      const isHovered = this.hoverIndex === i;

      // Background track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      this.drawRoundedRect(ctx, x, padding.top, barWidth, chartHeight, 6);
      ctx.fill();

      // Colored Bar
      if (animatedBarHeight > 0) {
        const gradient = ctx.createLinearGradient(0, y, 0, y + animatedBarHeight);
        if (pct === 100) {
          gradient.addColorStop(0, '#10B981'); // Emerald
          gradient.addColorStop(1, '#059669');
        } else if (pct > 0) {
          gradient.addColorStop(0, '#FF5722'); // Fire orange
          gradient.addColorStop(1, '#F59E0B'); // Amber
        } else {
          gradient.addColorStop(0, '#475569');
          gradient.addColorStop(1, '#334155');
        }

        ctx.fillStyle = gradient;
        if (isHovered) {
          ctx.shadowColor = pct === 100 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 87, 34, 0.5)';
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowBlur = 0;
        }

        this.drawRoundedRect(ctx, x, y, barWidth, Math.max(animatedBarHeight, 4), 6);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset
      }

      // Percentage label on top of bar
      ctx.fillStyle = isHovered ? '#FFFFFF' : '#94A3B8';
      ctx.font = '600 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const labelY = Math.min(y - 6, padding.top + chartHeight - 8);
      ctx.fillText(`${Math.round(pct)}%`, x + barWidth / 2, Math.max(labelY, 18));

      // Day of Week label below bar
      ctx.fillStyle = isHovered ? '#FF5722' : '#64748B';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText(item.label, x + barWidth / 2, height - 12);
    });

    // Draw Tooltip if hovered
    if (this.hoverIndex >= 0 && this.hoverIndex < data.length) {
      const item = data[this.hoverIndex];
      const x = padding.left + this.hoverIndex * colWidth + colWidth / 2;
      const tooltipText = `${item.date || item.label}: ${item.completed || 0}/${item.total || 0} (${Math.round(item.percentage || 0)}%)`;

      ctx.font = '500 11px Inter, sans-serif';
      const textWidth = ctx.measureText(tooltipText).width;
      const boxWidth = textWidth + 18;
      const boxHeight = 24;
      const boxX = Math.max(padding.left, Math.min(width - padding.right - boxWidth, x - boxWidth / 2));
      const boxY = 6;

      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      this.drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(tooltipText, boxX + boxWidth / 2, boxY + 16);
    }

    ctx.restore();
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    if (height <= 0) return;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
