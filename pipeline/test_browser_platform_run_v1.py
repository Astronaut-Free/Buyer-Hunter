import unittest

from pipeline.compile_browser_platform_run_v1 import classify_snapshot, count_public_records


class BrowserPlatformRunTests(unittest.TestCase):
    def test_blocked_and_seized_are_not_public_records(self):
        self.assertEqual(classify_snapshot('- heading "403 Forbidden"'), "BLOCKED_403")
        self.assertEqual(
            classify_snapshot('正在进行安全验证\n本网站使用安全服务防护恶意自动程序\nCloudflare'),
            "BLOCKED_403",
        )
        self.assertEqual(
            classify_snapshot('- heading "Domain Seized by Law Enforcement"'),
            "DOMAIN_SEIZED",
        )
        self.assertEqual(
            classify_snapshot('This domain name has been seized by Homeland Security Investigations'),
            "DOMAIN_SEIZED",
        )

    def test_hktdc_public_rfq_is_counted(self):
        text = 'heading "Request For Quotation List"\nparagraph: "RFQ ID: 1R000AAA"'
        self.assertEqual(classify_snapshot(text), "LIVE_PUBLIC_RFQ")
        self.assertEqual(count_public_records("hktdc_sourcing", text), 1)

    def test_jetro_proposals_are_deduplicated(self):
        text = 'Business case search\nFree Word Search\nPI00065439\nPI00065439'
        self.assertEqual(classify_snapshot(text), "LIVE_PUBLIC_SEARCH")
        self.assertEqual(count_public_records("japan_jetro", text), 1)

    def test_amazon_marketing_page_is_not_rfq_data(self):
        text = 'Request for Quote\nSign in\nHow to request for quote'
        self.assertEqual(classify_snapshot(text), "PUBLIC_INFO_ACCOUNT_REQUIRED")
        self.assertEqual(count_public_records("amazon_business", text), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
