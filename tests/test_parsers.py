"""tests/test_parsers.py —— 解析函数单元测试"""
import sys
sys.path.insert(0, '.')

from core.parsers import extract_tag, extract_list, parse_convert_output, parse_and_clean_entities


def test_extract_tag():
    text = "[标题] 测试标题\n[正文] 测试正文"
    assert extract_tag(text, "标题") == "测试标题"
    assert extract_tag(text, "正文") == "测试正文"
    print("✓ test_extract_tag 通过")


def test_parse_entities():
    raw = '{"entities":[{"name":"太和殿","type":"建筑名"},{"name":"乾隆","type":"人名"}]}'
    entities = parse_and_clean_entities(raw)
    assert len(entities) == 2
    assert entities[0]["name"] == "太和殿"
    print("✓ test_parse_entities 通过")


def test_parse_entities_dedup():
    raw = '{"entities":[{"name":"太和殿","type":"建筑名"},{"name":"太和殿","type":"建筑名"}]}'
    entities = parse_and_clean_entities(raw)
    assert len(entities) == 1
    print("✓ test_parse_entities_dedup 通过")


if __name__ == "__main__":
    test_extract_tag()
    test_parse_entities()
    test_parse_entities_dedup()
    print("全部测试通过！")
