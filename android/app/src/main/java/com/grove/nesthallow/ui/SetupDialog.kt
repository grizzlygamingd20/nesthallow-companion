package com.grove.nesthallow.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun SetupDialog(
    initialUrl: String,
    initialToken: String,
    onTest: suspend (String, String) -> String,
    onSave: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var url by remember { mutableStateOf(initialUrl.ifBlank { "https://" }) }
    var token by remember { mutableStateOf(initialToken) }
    var result by remember { mutableStateOf("") }
    var testing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Connect to the Grove backend") },
        text = {
            Column {
                Text("Paste your Vercel address and the device token you set there.")
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(url, { url = it }, label = { Text("Backend address") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    token, { token = it }, label = { Text("Device token") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth()
                )
                if (result.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(result)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(url, token) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(enabled = !testing, onClick = {
                testing = true
                result = "Testing…"
                scope.launch {
                    result = onTest(url, token)
                    testing = false
                }
            }) { Text("Test connection") }
        },
    )
}
