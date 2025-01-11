"use client";

import React, { useState } from "react";

function PdfToAudioPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Handle file selection
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setPdfFile(file);
    setPdfText(null); // Reset extracted text on new upload
  }

  // Handle processing PDF file
  async function handleProcessPdf() {
    if (!pdfFile) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", pdfFile);

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setPdfText(data.text);
      } else {
        console.error("Failed to parse PDF.");
        setPdfText("Failed to extract text from the PDF file.");
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
      setPdfText("An error occurred while processing the PDF file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center mb-8">PDF to Vietnamese Audio</h1>

      {/* Drag or Upload Section */}
      <div className="border-2 border-dashed border-gray-400 rounded-md p-8 text-center bg-gray-50">
        <input
          id="fileInput"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <label
          htmlFor="fileInput"
          className="cursor-pointer text-blue-600 hover:underline"
        >
          {pdfFile ? `Selected File: ${pdfFile.name}` : "Click or Drag a PDF file to upload"}
        </label>
      </div>

      {/* Audio Player Section */}
      <div className="mt-8">
        {pdfFile && (
          <audio controls className="w-full" src={undefined}>
            Your browser does not support the audio element.
          </audio>
        )}
      </div>

      {/* Process Button */}
      <div className="mt-4 text-center">
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={!pdfFile || loading}
          onClick={handleProcessPdf}
        >
          {loading ? "Processing..." : "Process and Start Reading"}
        </button>
      </div>

      {/* PDF Text Renderer */}
      {pdfText && (
        <div className="mt-8 p-4 border rounded bg-gray-100">
          <h2 className="text-2xl font-semibold mb-4">Extracted Text</h2>
          <p className="text-gray-700 whitespace-pre-line">{pdfText}</p>
        </div>
      )}
    </div>
  );
}

export default PdfToAudioPage;
