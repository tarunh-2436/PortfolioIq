from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

response = client.models.generate_content(
    model="gemini-3.8-flash",
    contents="""
    Analyze this simple portfolio:

    AAPL: 30%
    MSFT: 25%
    NVDA: 20%
    JPM: 15%
    JNJ: 10%

    Explain the main diversification and concentration
    characteristics in a concise paragraph.
    """,
    config=types.GenerateContentConfig(temperature=0.2),
)

print(response.text)
