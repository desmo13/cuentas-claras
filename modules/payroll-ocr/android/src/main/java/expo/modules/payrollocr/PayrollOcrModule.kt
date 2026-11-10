package expo.modules.payrollocr

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PayrollOcrModule : Module() {
  private fun lines(result: Text, page: Int): List<Map<String, Any>> = result.textBlocks.flatMap { block ->
    block.lines.map { line ->
      val box = line.boundingBox
      mapOf("text" to line.text, "x" to (box?.left ?: 0), "y" to (box?.top ?: 0), "w" to (box?.width() ?: 1), "h" to (box?.height() ?: 1), "page" to page)
    }
  }
  private fun words(result: Text, page: Int): List<Map<String, Any>> = result.textBlocks.flatMap { block ->
    block.lines.flatMap { line -> line.elements.map { word ->
      val box = word.boundingBox
      mapOf("text" to word.text, "x" to (box?.left ?: 0), "y" to (box?.top ?: 0), "w" to (box?.width() ?: 1), "h" to (box?.height() ?: 1), "page" to page)
    } }
  }
  override fun definition() = ModuleDefinition {
    Name("PayrollOcr")
    AsyncFunction("read") { uri: String, pdf: Boolean ->
      val context = appContext.reactContext ?: throw IllegalStateException("No se ha podido iniciar el lector.")
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        if (!pdf) {
          val result = Tasks.await(recognizer.process(InputImage.fromFilePath(context, Uri.parse(uri))))
          mapOf("text" to result.text, "lines" to lines(result, 1), "words" to words(result, 1), "pagesRead" to 1, "pageCount" to 1)
        } else {
          val descriptor = context.contentResolver.openFileDescriptor(Uri.parse(uri), "r")
            ?: throw IllegalArgumentException("No se ha podido abrir el PDF.")
          descriptor.use { fd ->
            PdfRenderer(fd).use { renderer ->
              val allLines = mutableListOf<Map<String, Any>>()
              val allWords = mutableListOf<Map<String, Any>>()
              val allText = mutableListOf<String>()
              val count = minOf(renderer.pageCount, 4)
              for (i in 0 until count) {
                renderer.openPage(i).use { page ->
                  val scale = minOf(1800f / page.width, 2600f / page.height)
                  val bitmap = Bitmap.createBitmap(maxOf(1, (page.width * scale).toInt()), maxOf(1, (page.height * scale).toInt()), Bitmap.Config.ARGB_8888)
                  try {
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
                    allText.add(result.text)
                    allLines.addAll(lines(result, i + 1))
                    allWords.addAll(words(result, i + 1))
                  } finally { bitmap.recycle() }
                }
              }
              mapOf("text" to allText.joinToString("\n\n"), "lines" to allLines, "words" to allWords, "pagesRead" to count, "pageCount" to renderer.pageCount)
            }
          }
        }
      } finally { recognizer.close() }
    }
  }
}
