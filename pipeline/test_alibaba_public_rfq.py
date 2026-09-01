from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
collector = importlib.import_module("collect_alibaba_public_rfq")


class AlibabaPublicRfqTests(unittest.TestCase):
    def test_parse_public_embedded_record(self):
        page = rb"""
        <script>
        window.PAGE_DATA["relate"].data.push({
          url: "\x2f\x2fsourcing.alibaba.com\x2frfq\x2fonepage\x2frfq_detail.htm\x3fp\x3dENC",
          id: "1684256156",
          rfqId: "1684256156",
          enrRfqId: "ENC",
          subject: "Organic\x20\x3cfont\x3e\x3cb\x3eMatcha\x3c\x2fb\x3e\x3c\x2ffont\x3e\x20Powder",
          description: "Product\x20Type\x3aGreen\x20Tea",
          country: "United\x20States",
          countrySimple: "US",
          quantity: '10000',
          quantityUnit: "Kilogram\x2fKilograms",
          openTimeStr: "1\x20hours\x20before",
          rfqLeftCount:parseInt("3" || 0),
          buyerName: 'Karan\x20Mistry'
        });
        </script>
        """
        rows = collector.parse_listing(page, collector.SEARCH_URL)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Organic Matcha Powder")
        self.assertEqual(rows[0]["quantity_raw"], "10000")
        self.assertEqual(rows[0]["quotes_left"], 3)
        self.assertEqual(rows[0]["buyer_country_code"], "US")
        self.assertTrue(rows[0]["source_url"].startswith("https://sourcing.alibaba.com/"))

    def test_matcha_accessory_is_rejected(self):
        for title, description in (
            ("Custom logo Matcha plastic cups", "Need 1000 cups with logos"),
            (
                "Custom Premium Marble-Look Matcha Tea Set",
                "Seeking a customized matcha tea set for premium gifting",
            ),
        ):
            relevant, reason = collector.product_relevance("MATCHA", title, description)
            self.assertFalse(relevant)
            self.assertEqual(reason, "matcha_accessory_or_packaging")

    def test_matcha_product_with_packaging_details_is_kept(self):
        relevant, reason = collector.product_relevance(
            "MATCHA", "Organic Matcha Tea stick packaging",
            "Product Type: Green Tea Ingredients: Green Tea Type: Instant tea",
        )
        self.assertTrue(relevant)
        self.assertIsNone(reason)

    def test_matcha_protein_and_skincare_are_rejected(self):
        for title in (
            "Matcha Flavored Protein Powder for Export",
            "Green Tea Matcha Body Scrub",
        ):
            relevant, reason = collector.product_relevance("MATCHA", title, "")
            self.assertFalse(relevant)
            self.assertEqual(reason, "matcha_non_food_product")

    def test_generic_categories_require_product_term_in_title(self):
        cases = (
            ("BLUEBERRY", "Fresh Fruit Smoothie Vending Machine", "Supports blueberry drinks"),
            ("CHILI", "High Quality Canned Sardine", "Seasoned with chili pepper"),
            ("TEA", "Bulk Food-Grade Nutritionals and Extracts", "Includes green tea extract"),
        )
        for category, title, description in cases:
            relevant, reason = collector.product_relevance(category, title, description)
            self.assertFalse(relevant)
            self.assertEqual(reason, "category_term_missing_from_title")

    def test_generic_category_equipment_is_rejected(self):
        cases = (
            ("BLUEBERRY", "Agricultural Greenhouse for Blueberry Planting"),
            ("BLUEBERRY", "Aftermarket Blueberry Style Headlights"),
            ("CHILI", "Automatic Chili Pepper Cutting Machine"),
            ("TEA", "Automatic Green Tea Packing Machine"),
            ("TEA", "Green Tea Matcha Skincare Body Scrub"),
        )
        for category, title in cases:
            relevant, reason = collector.product_relevance(category, title, "")
            self.assertFalse(relevant)
            self.assertEqual(reason, "excluded_non_product")

    def test_generic_food_products_are_kept(self):
        for category, title in (
            ("BLUEBERRY", "Bulk Blueberry Fruit Powder"),
            ("CHILI", "Dried Red Chili Pepper"),
            ("TEA", "Loose Leaf Oolong Tea"),
        ):
            relevant, reason = collector.product_relevance(category, title, "")
            self.assertTrue(relevant)
            self.assertIsNone(reason)


if __name__ == "__main__":
    unittest.main(verbosity=2)
