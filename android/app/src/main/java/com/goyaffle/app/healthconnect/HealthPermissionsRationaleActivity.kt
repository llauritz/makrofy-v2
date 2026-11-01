package com.goyaffle.app.healthconnect

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * What Health Connect opens when the user taps Yaffle's privacy policy link
 * on its permission screens (both the Android 13 rationale action and the
 * Android 14+ permission-usage alias point here). Google requires it, and it
 * must show the same policy as the Play listing, so it opens that page and
 * gets out of the way.
 */
class HealthPermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
        } catch (e: ActivityNotFoundException) {
            // No browser: nothing to show, just return to Health Connect.
        }
        finish()
    }

    companion object {
        const val PRIVACY_POLICY_URL = "https://goyaffle.web.app/privacy"
    }
}
