package com.goyaffle.app.healthconnect

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The bridge between the web app and Health Connect (docs/adr/0014). The web
 * side (src/native/health-connect.ts) decides what to write and when; this
 * class only translates: Entries in as NutritionRecords keyed by their Entry
 * id, weigh-ins out as plain { timeMs, kg } samples. Yaffle asks for exactly
 * two permissions, each on its own when its Settings toggle is switched on.
 *
 * A revoked permission rejects with the code PERMISSION_DENIED, which the web
 * side turns into switching that toggle off.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val client: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    override fun handleOnDestroy() {
        scope.cancel()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val availability = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs-install"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("availability", availability))
    }

    @PluginMethod
    fun getGrantedPermissions(call: PluginCall) {
        if (!isAvailable()) return call.resolve(permissionsJson(emptySet()))
        scope.launch {
            try {
                call.resolve(permissionsJson(client.permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read permissions", "FAILED", e)
            }
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val permission = permissionFor(call.getString("permission"))
            ?: return call.reject("Unknown permission", "INVALID")
        if (!isAvailable()) return call.reject("Health Connect is not available", "UNAVAILABLE")
        scope.launch {
            try {
                if (permission in client.permissionController.getGrantedPermissions()) {
                    call.resolve(JSObject().put("granted", true))
                    return@launch
                }
                val intent = PermissionController.createRequestPermissionResultContract()
                    .createIntent(context, setOf(permission))
                startActivityForResult(call, intent, "onPermissionResult")
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not ask for permission", "FAILED", e)
            }
        }
    }

    // Health Connect's own screen has closed; ask it what is granted now
    // rather than trusting the result intent, which is empty on a back press.
    @ActivityCallback
    private fun onPermissionResult(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        if (call == null) return
        val permission = permissionFor(call.getString("permission")) ?: return call.reject("Unknown permission")
        scope.launch {
            try {
                val granted = permission in client.permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("granted", granted))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read permissions", "FAILED", e)
            }
        }
    }

    @PluginMethod
    fun upsertNutrition(call: PluginCall) {
        val input = call.getArray("records") ?: return call.reject("records required", "INVALID")
        val records = try {
            (0 until input.length()).map { toNutritionRecord(input.getJSONObject(it)) }
        } catch (e: Exception) {
            return call.reject(e.message ?: "Invalid record", "INVALID", e)
        }
        guarded(call) {
            // A record whose client record id already exists is updated in
            // place when its version is higher, so this is an upsert.
            client.insertRecords(records)
            call.resolve()
        }
    }

    @PluginMethod
    fun deleteNutrition(call: PluginCall) {
        val input = call.getArray("clientRecordIds") ?: return call.reject("clientRecordIds required", "INVALID")
        val ids = (0 until input.length()).map { input.getString(it) }
        guarded(call) {
            client.deleteRecords(
                NutritionRecord::class,
                recordIdsList = emptyList(),
                clientRecordIdsList = ids,
            )
            call.resolve()
        }
    }

    @PluginMethod
    fun readWeight(call: PluginCall) {
        val startMs = call.getLong("startMs") ?: return call.reject("startMs required", "INVALID")
        val endMs = call.getLong("endMs") ?: return call.reject("endMs required", "INVALID")
        guarded(call) {
            val samples = JSArray()
            var pageToken: String? = null
            do {
                val response = client.readRecords(
                    ReadRecordsRequest(
                        recordType = WeightRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(
                            Instant.ofEpochMilli(startMs),
                            Instant.ofEpochMilli(endMs),
                        ),
                        pageToken = pageToken,
                    )
                )
                for (record in response.records) {
                    samples.put(
                        JSObject()
                            .put("timeMs", record.time.toEpochMilli())
                            .put("kg", record.weight.inKilograms)
                    )
                }
                pageToken = response.pageToken
            } while (pageToken != null)
            call.resolve(JSObject().put("samples", samples))
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        // Android 14+ can open Yaffle's own page in Health Connect; older
        // versions open the Health Connect app's settings.
        val intents = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                add(
                    Intent(ACTION_MANAGE_HEALTH_PERMISSIONS)
                        .putExtra(Intent.EXTRA_PACKAGE_NAME, context.packageName)
                )
            }
            add(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
        }
        startFirst(intents)
        call.resolve()
    }

    @PluginMethod
    fun openInstall(call: PluginCall) {
        val onboarding = Uri.encode("healthconnect://onboarding")
        startFirst(
            listOf(
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=$onboarding"))
                    .setPackage("com.android.vending")
                    .putExtra("overlay", true)
                    .putExtra("callerId", context.packageName),
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER")),
            )
        )
        call.resolve()
    }

    private fun isAvailable() =
        HealthConnectClient.getSdkStatus(context, PROVIDER) == HealthConnectClient.SDK_AVAILABLE

    private fun guarded(call: PluginCall, block: suspend () -> Unit) {
        if (!isAvailable()) return call.reject("Health Connect is not available", "UNAVAILABLE")
        scope.launch {
            try {
                block()
            } catch (e: SecurityException) {
                call.reject(e.message ?: "Permission denied", "PERMISSION_DENIED", e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect call failed", "FAILED", e)
            }
        }
    }

    private fun startFirst(intents: List<Intent>) {
        for (intent in intents) {
            try {
                activity.startActivity(intent)
                return
            } catch (e: ActivityNotFoundException) {
                continue // try the next one
            }
        }
    }

    private fun toNutritionRecord(o: JSONObject): NutritionRecord {
        val start = Instant.ofEpochMilli(o.getLong("startTimeMs"))
        val end = Instant.ofEpochMilli(o.getLong("endTimeMs"))
        val zone = ZoneId.systemDefault().rules
        return NutritionRecord(
            startTime = start,
            startZoneOffset = zone.getOffset(start),
            endTime = end,
            endZoneOffset = zone.getOffset(end),
            metadata = Metadata.manualEntry(
                clientRecordId = o.getString("clientRecordId"),
                // Each write is newer than the last one this device made, so
                // Health Connect always takes it over the stored version.
                clientRecordVersion = System.currentTimeMillis(),
            ),
            name = o.optString("name").ifEmpty { null },
            mealType = mealTypeFor(o.optString("mealType")),
            energy = Energy.kilocalories(o.getDouble("kcal")),
            protein = o.optGrams("protein"),
            totalFat = o.optGrams("fat"),
            totalCarbohydrate = o.optGrams("carbs"),
        )
    }

    private fun JSONObject.optGrams(key: String): Mass? =
        if (has(key) && !isNull(key)) Mass.grams(getDouble(key)) else null

    private fun permissionsJson(granted: Set<String>) = JSObject()
        .put("writeNutrition", WRITE_NUTRITION in granted)
        .put("readWeight", READ_WEIGHT in granted)

    companion object {
        private const val PROVIDER = "com.google.android.apps.healthdata"
        private const val ACTION_MANAGE_HEALTH_PERMISSIONS =
            "android.health.connect.action.MANAGE_HEALTH_PERMISSIONS"

        private val WRITE_NUTRITION = HealthPermission.getWritePermission(NutritionRecord::class)
        private val READ_WEIGHT = HealthPermission.getReadPermission(WeightRecord::class)

        private fun permissionFor(name: String?): String? = when (name) {
            "writeNutrition" -> WRITE_NUTRITION
            "readWeight" -> READ_WEIGHT
            else -> null
        }

        private fun mealTypeFor(name: String): Int = when (name) {
            "breakfast" -> MealType.MEAL_TYPE_BREAKFAST
            "lunch" -> MealType.MEAL_TYPE_LUNCH
            "dinner" -> MealType.MEAL_TYPE_DINNER
            "snack" -> MealType.MEAL_TYPE_SNACK
            else -> MealType.MEAL_TYPE_UNKNOWN
        }
    }
}
