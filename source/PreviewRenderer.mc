import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

//! Stateless vector renderer for Full Route Preview mode (Waiting for GPS / Far Away)
//! and shared HUD primitives (pill capsules, distance formatting).
module PreviewRenderer {

    const PI = 3.1415927f;
    const TWO_PI = 6.2831853f;
    const METERS_PER_MICRO_LON = 1.113195f;

    const COLOR_CYAN = 0x00E5FF;
    const COLOR_LIME = 0xA3E635;
    const COLOR_LIME_FAINT = 0x4D7C0F;
    const COLOR_WHITE = 0xFFFFFF;
    const COLOR_PILL_BG = 0x041C24;

    const TARGET_STEPS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

    //! Formats meters into a compact human-readable distance string ("850 m" or "2.4 km").
    function formatDistance(meters as Float) as String {
        if (meters >= 1000.0f) {
            return (meters / 1000.0f).format("%.1f") + " km";
        }
        return meters.toNumber() + " m";
    }

    //! Draws a centered pill capsule badge with 1px outline and centered label.
    function drawPillCapsule(
        dc as Graphics.Dc,
        cx as Number,
        cy as Number,
        font as Graphics.FontType,
        text as String,
        padX as Number,
        bgColor as Number,
        borderColor as Number,
        textColor as Number
    ) as Void {
        var fontH = dc.getFontHeight(font);
        var textW = dc.getTextWidthInPixels(text, font);
        var pillW = textW + padX;
        var pillH = (fontH * 0.92f).toNumber();
        if (pillH < 20) { pillH = 20; }
        var pillX = cx - (pillW / 2);
        var pillY = cy - (pillH / 2);
        var pillR = (pillH / 2).toNumber();

        dc.setColor(bgColor, bgColor);
        dc.fillRoundedRectangle(pillX, pillY, pillW, pillH, pillR);

        dc.setColor(borderColor, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawRoundedRectangle(pillX, pillY, pillW, pillH, pillR);

        dc.setColor(textColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, font, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function render(dc as Graphics.Dc, df as RouteDataField) as Void {
        if (df.mPointCount < 2) {
            return;
        }

        var cx = df.mCenterX;
        var cy = df.mCenterY;
        var w = df.mScreenW;
        var h = df.mScreenH;
        var ringR = (cx < cy ? cx : cy) - 10;

        // 1. Outer Compass Ring & 12 o'clock Watch Heading Index Tick
        dc.setColor(0x1E293B, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(cx, cy, ringR);

        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(cx, cy - ringR - 3, cx, cy - ringR + 3);

        // 2. Compute route thumbnail placement & scaling
        var thumbCy = (h * 0.44f).toNumber();
        var dLonMetric = (df.mMaxLon - df.mMinLon).toFloat() * df.mRouteCosLat;
        var dLatMetric = (df.mMaxLat - df.mMinLat).toFloat();
        if (dLonMetric < 1.0f) { dLonMetric = 1.0f; }
        if (dLatMetric < 1.0f) { dLatMetric = 1.0f; }

        var scaleX = (w * 0.56f) / dLonMetric;
        var scaleY = (h * 0.36f) / dLatMetric;
        var thumbScale = (scaleX < scaleY) ? scaleX : scaleY;
        var lonScale = df.mRouteCosLat * thumbScale;

        var pts = df.mPoints;
        var startSx = (cx + (pts[1] - df.mCenterLon).toFloat() * lonScale).toNumber();
        var startSy = (thumbCy - (pts[0] - df.mCenterLat).toFloat() * thumbScale).toNumber();

        // 3. Render thumbnail route geometry
        renderThumbnail(dc, df, thumbCy, lonScale, thumbScale, startSx, startSy);

        // 4. Adaptive Visual Scale Bar (|── 500 m ──|) — skip on compact split-screen fields
        if (h >= 220) {
            renderScaleBar(dc, cx, h, thumbScale);
        }

        // 5. Total Route Distance inside Bioluminescent Pill Capsule
        drawPillCapsule(
            dc,
            cx,
            (h * 0.80f).toNumber(),
            Graphics.FONT_TINY,
            formatDistance(df.mTotalRouteMeters),
            22,
            COLOR_PILL_BG,
            COLOR_CYAN,
            COLOR_CYAN
        );

        // 6. Outer Ring Indicators & Navigation Guidance
        if (!df.mHasGps || df.mCurrLatMicro == 0) {
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            var gpsMsg = df.mHasEverHadGps ? "SEARCHING GPS..." : "WAITING FOR GPS...";
            dc.drawText(cx, (h * 0.85f).toNumber(), Graphics.FONT_XTINY, gpsMsg, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        var userSx = cx + (df.mCurrLonMicro - df.mCenterLon).toFloat() * lonScale;
        var userSy = thumbCy - (df.mCurrLatMicro - df.mCenterLat).toFloat() * thumbScale;
        var udx = userSx - cx;
        var udy = userSy - cy;
        var maxInnerR = (ringR - 14).toFloat();

        if (udx * udx + udy * udy <= maxInnerR * maxInnerR) {
            renderUserArrow(dc, df, userSx.toNumber(), userSy.toNumber(), startSx, startSy);
        }

        renderTargetArrow(dc, df, ringR);
    }

    function renderThumbnail(
        dc as Graphics.Dc,
        df as RouteDataField,
        thumbCy as Number,
        lonScale as Float,
        thumbScale as Float,
        startSx as Number,
        startSy as Number
    ) as Void {
        var cx = df.mCenterX;
        var pts = df.mPoints;
        var ptCount = df.mPointCount;
        var cLat = df.mCenterLat;
        var cLon = df.mCenterLon;

        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);

        var lastSx = startSx;
        var lastSy = startSy;

        for (var i = 1; i < ptCount; i++) {
            var idx = i * 2;
            var currSx = (cx + (pts[idx + 1] - cLon).toFloat() * lonScale).toNumber();
            var currSy = (thumbCy - (pts[idx] - cLat).toFloat() * thumbScale).toNumber();

            var dx = currSx - lastSx;
            var dy = currSy - lastSy;

            if (i == ptCount - 1 || (dx * dx + dy * dy) >= 9) {
                dc.drawLine(lastSx, lastSy, currSx, currSy);
                dc.fillCircle(lastSx, lastSy, 1);
                lastSx = currSx;
                lastSy = currSy;
            }
        }

        var isLoop = ((startSx - lastSx) * (startSx - lastSx) + (startSy - lastSy) * (startSy - lastSy)) < 36;

        // Route Start landmark anchor
        dc.setColor(COLOR_LIME_FAINT, COLOR_LIME_FAINT);
        dc.fillCircle(startSx, startSy, 8);
        dc.setColor(COLOR_LIME, COLOR_LIME);
        dc.fillCircle(startSx, startSy, 5);
        dc.setColor(COLOR_WHITE, COLOR_WHITE);
        dc.fillCircle(startSx, startSy, 2);

        if (!isLoop) {
            dc.setColor(COLOR_CYAN, COLOR_CYAN);
            dc.fillCircle(lastSx, lastSy, 5);
            dc.setColor(COLOR_WHITE, COLOR_WHITE);
            dc.fillCircle(lastSx, lastSy, 2);
        }
    }

    function renderScaleBar(dc as Graphics.Dc, cx as Number, h as Number, thumbScale as Float) as Void {
        var pixelsPerMeter = thumbScale / METERS_PER_MICRO_LON;
        if (pixelsPerMeter <= 0.00001f) {
            return;
        }

        var bestStep = 500;
        var bestDiff = 9999.0f;
        for (var s = 0; s < TARGET_STEPS.size(); s++) {
            var diff = TARGET_STEPS[s] * pixelsPerMeter - 55.0f;
            if (diff < 0.0f) { diff = -diff; }
            if (diff < bestDiff) {
                bestDiff = diff;
                bestStep = TARGET_STEPS[s];
            }
        }

        var barW = (bestStep * pixelsPerMeter).toNumber();
        if (barW < 30) { barW = 30; }
        if (barW > 110) { barW = 110; }
        var barX = cx - (barW / 2);
        var barY = (h * 0.70f).toNumber();

        var scaleLabel = (bestStep >= 1000) ? (bestStep / 1000) + " km" : bestStep + " m";
        var fontH = dc.getFontHeight(Graphics.FONT_XTINY);
        var textY = barY - (fontH / 2) - 6;

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, textY, Graphics.FONT_XTINY, scaleLabel, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setPenWidth(2);
        dc.drawLine(barX, barY, barX + barW, barY);
        dc.drawLine(barX, barY - 3, barX, barY + 3);
        dc.drawLine(barX + barW, barY - 3, barX + barW, barY + 3);
    }

    function renderUserArrow(
        dc as Graphics.Dc,
        df as RouteDataField,
        uPlotX as Number,
        uPlotY as Number,
        startSx as Number,
        startSy as Number
    ) as Void {
        var hdx = Math.sin(df.mRenderHeading).toFloat();
        var hdy = -Math.cos(df.mRenderHeading).toFloat();
        var hpx = -hdy;
        var hpy = hdx;

        var tipX = (uPlotX + hdx * 8.0f).toNumber();
        var tipY = (uPlotY + hdy * 8.0f).toNumber();
        var w1X = (uPlotX - hdx * 6.0f + hpx * 5.0f).toNumber();
        var w1Y = (uPlotY - hdy * 6.0f + hpy * 5.0f).toNumber();
        var w2X = (uPlotX - hdx * 6.0f - hpx * 5.0f).toNumber();
        var w2Y = (uPlotY - hdy * 6.0f - hpy * 5.0f).toNumber();
        var notchX = (uPlotX - hdx * 2.0f).toNumber();
        var notchY = (uPlotY - hdy * 2.0f).toNumber();

        var buf = df.mPolygonBuf;
        buf[0][0] = tipX; buf[0][1] = tipY;
        buf[1][0] = w1X; buf[1][1] = w1Y;
        buf[2][0] = notchX; buf[2][1] = notchY;
        buf[3][0] = w2X; buf[3][1] = w2Y;

        dc.setColor(COLOR_CYAN, COLOR_CYAN);
        dc.fillPolygon(buf);

        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(tipX, tipY, w1X, w1Y);
        dc.drawLine(w1X, w1Y, notchX, notchY);
        dc.drawLine(notchX, notchY, w2X, w2Y);
        dc.drawLine(w2X, w2Y, tipX, tipY);

        // Dotted guidance line towards route start
        var gdx = startSx - uPlotX;
        var gdy = startSy - uPlotY;
        var gDist = Math.sqrt(gdx * gdx + gdy * gdy).toFloat();
        if (gDist > 14.0f) {
            dc.setColor(COLOR_LIME_FAINT, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            var dashStep = 7.0f;
            var dashCount = (gDist / dashStep).toNumber();
            for (var d = 0; d < dashCount; d += 2) {
                var t1 = (d * dashStep) / gDist;
                var t2 = ((d + 1) * dashStep) / gDist;
                if (t2 > 1.0f) { t2 = 1.0f; }
                dc.drawLine(
                    (uPlotX + gdx * t1).toNumber(),
                    (uPlotY + gdy * t1).toNumber(),
                    (uPlotX + gdx * t2).toNumber(),
                    (uPlotY + gdy * t2).toNumber()
                );
            }
        }
    }

    function renderTargetArrow(dc as Graphics.Dc, df as RouteDataField, ringR as Number) as Void {
        var cx = df.mCenterX;
        var cy = df.mCenterY;
        var targetAngle = df.mBearingToStart - df.mRenderHeading;
        while (targetAngle > PI) { targetAngle -= TWO_PI; }
        while (targetAngle < -PI) { targetAngle += TWO_PI; }

        var tdx = Math.sin(targetAngle).toFloat();
        var tdy = -Math.cos(targetAngle).toFloat();
        var ttx = -tdy;
        var tty = tdx;

        var arrowTipR = ringR - 4;
        var arrowTailR = arrowTipR - 13;

        var tTipX = (cx + tdx * arrowTipR).toNumber();
        var tTipY = (cy + tdy * arrowTipR).toNumber();
        var tw1X = (cx + tdx * arrowTailR + ttx * 6.0f).toNumber();
        var tw1Y = (cy + tdy * arrowTailR + tty * 6.0f).toNumber();
        var tw2X = (cx + tdx * arrowTailR - ttx * 6.0f).toNumber();
        var tw2Y = (cy + tdy * arrowTailR - tty * 6.0f).toNumber();
        var tNotchX = (cx + tdx * (arrowTailR + 4)).toNumber();
        var tNotchY = (cy + tdy * (arrowTailR + 4)).toNumber();

        var buf = df.mPolygonBuf;
        buf[0][0] = tTipX; buf[0][1] = tTipY;
        buf[1][0] = tw1X; buf[1][1] = tw1Y;
        buf[2][0] = tNotchX; buf[2][1] = tNotchY;
        buf[3][0] = tw2X; buf[3][1] = tw2Y;

        dc.setColor(COLOR_LIME, COLOR_LIME);
        dc.fillPolygon(buf);

        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(tTipX, tTipY, tw1X, tw1Y);
        dc.drawLine(tw1X, tw1Y, tNotchX, tNotchY);
        dc.drawLine(tNotchX, tNotchY, tw2X, tw2Y);
        dc.drawLine(tw2X, tw2Y, tTipX, tTipY);

        // Label for target direction arrow: "START" with distance to start
        var startDistStr = formatDistance(df.mDistToStart.toFloat());
        var fontH1 = dc.getFontHeight(Graphics.FONT_XTINY);
        var fontH2 = dc.getFontHeight(Graphics.FONT_TINY);
        var textW1 = dc.getTextWidthInPixels("START", Graphics.FONT_XTINY);
        var textW2 = dc.getTextWidthInPixels(startDistStr, Graphics.FONT_TINY);
        var halfW = ((textW1 > textW2) ? textW1 : textW2) / 2.0f;
        var halfH = (fontH1 + fontH2 + 2) / 2.0f;

        var absTdx = (tdx < 0.0f) ? -tdx : tdx;
        var absTdy = (tdy < 0.0f) ? -tdy : tdy;
        var lblR = arrowTailR.toFloat() - 8.0f - (absTdx * halfW + absTdy * halfH);

        var lblBaseX = (cx + tdx * lblR).toNumber();
        var lblBaseY = (cy + tdy * lblR).toNumber();

        dc.setColor(COLOR_LIME, Graphics.COLOR_TRANSPARENT);
        dc.drawText(lblBaseX, (lblBaseY - halfH + (fontH1 / 2.0f)).toNumber(), Graphics.FONT_XTINY, "START", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        dc.setColor(COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(lblBaseX, (lblBaseY + halfH - (fontH2 / 2.0f)).toNumber(), Graphics.FONT_TINY, startDistStr, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
